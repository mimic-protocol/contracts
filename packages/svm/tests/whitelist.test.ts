/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet, web3 } from '@coral-xyz/anchor'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import WhitelistSDK, { EntityType, WhitelistStatus } from '../sdks/whitelist/Whitelist'
import * as WhitelistIDL from '../target/idl/whitelist.json'
import { Whitelist } from '../target/types/whitelist'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Whitelist Program', () => {
  let client: LiteSVM

  let deployer: web3.Keypair
  let admin: web3.Keypair
  let proposedAdmin: web3.Keypair
  let malicious: web3.Keypair

  let deployerProvider: LiteSVMProvider
  let adminProvider: LiteSVMProvider
  let proposedAdminProvider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider

  let program: Program<Whitelist>

  let deployerSdk: WhitelistSDK
  let adminSdk: WhitelistSDK
  let proposedAdminSdk: WhitelistSDK
  let maliciousSdk: WhitelistSDK

  before(async () => {
    deployer = web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    admin = web3.Keypair.generate()
    proposedAdmin = web3.Keypair.generate()
    malicious = web3.Keypair.generate()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()

    deployerProvider = new LiteSVMProvider(client, new Wallet(deployer))
    adminProvider = new LiteSVMProvider(client, new Wallet(admin))
    proposedAdminProvider = new LiteSVMProvider(client, new Wallet(proposedAdmin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))

    program = new Program<Whitelist>(WhitelistIDL as any, deployerProvider)

    deployerSdk = new WhitelistSDK(deployerProvider)
    adminSdk = new WhitelistSDK(adminProvider)
    proposedAdminSdk = new WhitelistSDK(proposedAdminProvider)
    maliciousSdk = new WhitelistSDK(maliciousProvider)

    deployerProvider.client.airdrop(deployer.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(admin.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(proposedAdmin.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(malicious.publicKey, BigInt(100_000_000_000))
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('Whitelist', () => {
    describe('initialize', () => {
      it('cant initialize if not deployer', async () => {
        const newAdmin = web3.Keypair.generate().publicKey
        const proposedAdminCooldown = 3600

        const ix = await maliciousSdk.initializeIx(newAdmin, proposedAdminCooldown)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only deployer can call this instruction`)
      })

      it('cant initialize with cooldown = 0', async () => {
        const proposedAdminCooldown = 0

        const ix = await deployerSdk.initializeIx(admin.publicKey, proposedAdminCooldown)
        const res = await makeTxSignAndSend(deployerProvider, ix)

        expect(res.toString()).to.include(`Cooldown can't be zero`)
      })

      it('cant initialize with cooldown > MAX_COOLDOWN', async () => {
        const proposedAdminCooldown = 3600 * 24 * 30 + 1

        const ix = await deployerSdk.initializeIx(admin.publicKey, proposedAdminCooldown)
        const res = await makeTxSignAndSend(deployerProvider, ix)

        expect(res.toString()).to.include(`Cooldown too large`)
      })

      it('should initialize', async () => {
        const proposedAdminCooldown = 3600

        const ix = await deployerSdk.initializeIx(admin.publicKey, proposedAdminCooldown)
        await makeTxSignAndSend(deployerProvider, ix)

        const settings = await program.account.globalSettings.fetch(deployerSdk.getGlobalSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(admin.publicKey.toString())
        expect(settings.proposedAdmin).to.be.null
        expect(settings.proposedAdminCooldown.toNumber()).to.be.eq(3600)
        expect(settings.proposedAdminNextChangeTimestamp.toString()).to.be.eq('18446744073709551615') // u64::MAX
      })

      it('cant call initialize again', async () => {
        const proposedAdminCooldown = 3600

        const ix = await deployerSdk.initializeIx(admin.publicKey, proposedAdminCooldown)
        const res = await makeTxSignAndSend(deployerProvider, ix)

        expect(res.toString()).to.include(
          `Allocate: account Address { address: ${deployerSdk.getGlobalSettingsPubkey()}, base: None } already in use`
        )
      })
    })

    describe('propose_admin and set_proposed_admin', () => {
      it('cant propose admin if not admin', async () => {
        const ix = await maliciousSdk.proposeAdminIx(proposedAdmin.publicKey)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only admin can call this instruction`)
      })

      it('cant set proposed admin if no next admin was proposed yet', async () => {
        const ix = await adminSdk.setProposedAdminIx()
        const res = await makeTxSignAndSend(adminProvider, ix)

        expect(res.toString()).to.include(`Only proposed admin can call this instruction`)
      })

      it('should propose admin successfully', async () => {
        const ix = await adminSdk.proposeAdminIx(proposedAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const updatedSettings = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        expect(updatedSettings.proposedAdmin?.toString()).to.be.eq(proposedAdmin.publicKey.toString())
        expect(updatedSettings.proposedAdminNextChangeTimestamp.toNumber()).to.be.greaterThan(0)
      })

      it('cant propose admin if one is already proposed', async () => {
        const proposedAdmin2 = web3.Keypair.generate().publicKey

        const ix = await adminSdk.proposeAdminIx(proposedAdmin2)
        const res = await makeTxSignAndSend(adminProvider, ix)

        expect(res.toString()).to.include(`Proposed admin is already set`)
      })

      it('cant set proposed admin if not proposed admin', async () => {
        const ix = await maliciousSdk.setProposedAdminIx()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only proposed admin can call this instruction`)
      })

      it('cant set proposed admin if cooldown hasnt passed', async () => {
        const ix = await proposedAdminSdk.setProposedAdminIx()
        const res = await makeTxSignAndSend(proposedAdminProvider, ix)

        expect(res.toString()).to.include(
          `Can't set proposed admin - either no next admin is proposed or cooldown period is not over yet`
        )
      })

      it('should set proposed admin successfully after cooldown', async () => {
        warpSeconds(deployerProvider, 3601)

        const ix = await proposedAdminSdk.setProposedAdminIx()
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const updatedSettings = await program.account.globalSettings.fetch(deployerSdk.getGlobalSettingsPubkey())
        expect(updatedSettings.admin.toString()).to.be.eq(proposedAdmin.publicKey.toString())
        expect(updatedSettings.proposedAdmin).to.be.null
        expect(updatedSettings.proposedAdminNextChangeTimestamp.toString()).to.be.eq('18446744073709551615') // u64::MAX
      })

      it('resets admin to original one for next tests', async () => {
        const ix = await proposedAdminSdk.proposeAdminIx(admin.publicKey)
        await makeTxSignAndSend(proposedAdminProvider, ix)

        warpSeconds(deployerProvider, 3601)

        const ix2 = await adminSdk.setProposedAdminIx()
        await makeTxSignAndSend(adminProvider, ix2)

        const updatedSettings = await program.account.globalSettings.fetch(deployerSdk.getGlobalSettingsPubkey())
        expect(updatedSettings.admin.toString()).to.be.eq(admin.publicKey.toString())
        expect(updatedSettings.proposedAdmin).to.be.null
        expect(updatedSettings.proposedAdminNextChangeTimestamp.toString()).to.be.eq('18446744073709551615') // u64::MAX
      })

      it('can propose same admin as current admin', async () => {
        const settings = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        const currentAdmin = settings.admin

        const ix = await adminSdk.proposeAdminIx(currentAdmin)
        await makeTxSignAndSend(adminProvider, ix)

        const updatedSettings = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        expect(updatedSettings.proposedAdmin?.toString()).to.be.eq(currentAdmin.toString())

        warpSeconds(deployerProvider, 3601)

        await makeTxSignAndSend(adminProvider, await adminSdk.setProposedAdminIx())
        const updatedSettings2 = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        expect(updatedSettings2.admin.toString()).to.be.eq(admin.publicKey.toString())
        expect(updatedSettings2.proposedAdmin).to.be.null
      })

      it('should calculate proposed_admin_next_change_timestamp correctly', async () => {
        const settingsBefore = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        const cooldown = settingsBefore.proposedAdminCooldown.toNumber()

        const clockBefore = deployerProvider.client.getClock()
        const nowBefore = Number(clockBefore.unixTimestamp)

        const ix = await adminSdk.proposeAdminIx(proposedAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settingsAfter = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        const expectedTimestamp = nowBefore + cooldown
        expect(settingsAfter.proposedAdminNextChangeTimestamp.toNumber()).to.be.eq(expectedTimestamp)
      })
    })

    describe('set_entity_whitelist_status', () => {
      let validator: web3.PublicKey
      let axia: web3.PublicKey
      let solver: web3.PublicKey
      let validator2: web3.PublicKey
      let axia2: web3.PublicKey
      let solver2: web3.PublicKey

      before(() => {
        validator = web3.Keypair.generate().publicKey
        axia = web3.Keypair.generate().publicKey
        solver = web3.Keypair.generate().publicKey
        validator2 = web3.Keypair.generate().publicKey
        axia2 = web3.Keypair.generate().publicKey
        solver2 = web3.Keypair.generate().publicKey
      })

      it('cant set status if not admin', async () => {
        const ix = await maliciousSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Whitelisted
        )
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only admin can call this instruction`)
      })

      it('should set whitelist status successfully (validator)', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('should set whitelist status successfully (axia)', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('should set whitelist status successfully (solver)', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(EntityType.Solver, solver, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('warps some seconds and changes admin for next tests', async () => {
        const diff = 3601

        const then = Number(client.getClock().unixTimestamp)
        const ix = await adminSdk.proposeAdminIx(proposedAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        warpSeconds(deployerProvider, diff)

        const now = Number(client.getClock().unixTimestamp)
        expect(now - then).to.be.eq(diff)

        const ix2 = await proposedAdminSdk.setProposedAdminIx()
        await makeTxSignAndSend(proposedAdminProvider, ix2)
      })

      it('should update status correctly (whitelist to blacklist transition) (validator)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Blacklisted
        )
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('should update status correctly (whitelist to blacklist transition) (axia)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia, WhitelistStatus.Blacklisted)
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('should update status correctly (whitelist to blacklist transition) (solver)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Solver,
          solver,
          WhitelistStatus.Blacklisted
        )
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (validator)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (axia)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (solver)', async () => {
        const ix = await proposedAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Solver,
          solver,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(proposedAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          proposedAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(proposedAdmin.publicKey.toString())
      })

      it('resets admin to original one for next tests', async () => {
        const ix = await proposedAdminSdk.proposeAdminIx(admin.publicKey)
        await makeTxSignAndSend(proposedAdminProvider, ix)

        warpSeconds(deployerProvider, 3601)

        const ix2 = await adminSdk.setProposedAdminIx()
        await makeTxSignAndSend(adminProvider, ix2)

        const updatedSettings = await program.account.globalSettings.fetch(deployerSdk.getGlobalSettingsPubkey())
        expect(updatedSettings.admin.toString()).to.be.eq(admin.publicKey.toString())
        expect(updatedSettings.proposedAdmin).to.be.null
        expect(updatedSettings.proposedAdminNextChangeTimestamp.toString()).to.be.eq('18446744073709551615') // u64::MAX
      })

      it('can whitelist another validator', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator2,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Validator, validator2)
        )
        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('can whitelist another axia', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia2, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia2)
        )
        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('can whitelist another solver', async () => {
        const ix = await adminSdk.setEntityWhitelistStatusIx(EntityType.Solver, solver2, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Solver, solver2)
        )
        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('should create separate accounts for same pubkey with different entity types', async () => {
        const ix1 = await adminSdk.setEntityWhitelistStatusIx(EntityType.Validator, axia, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(adminProvider, ix1)

        const validatorRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
        )
        const axiaRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )

        expect(validatorRegistry.entityType).to.deep.include({ validator: {} })
        expect(validatorRegistry.status).to.deep.include({ whitelisted: {} })
        expect(axiaRegistry.entityType).to.deep.include({ axia: {} })
        expect(axiaRegistry.status).to.deep.include({ whitelisted: {} })

        const validatorPda = adminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
        const axiaPda = adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        expect(validatorPda.toString()).to.not.eq(axiaPda.toString())
      })
    })
  })
})
