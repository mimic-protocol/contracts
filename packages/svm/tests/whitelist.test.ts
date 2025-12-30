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
import { expectTransactionError } from './helpers/settler-helpers'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Whitelist Program', () => {
  let client: LiteSVM

  let deployer: web3.Keypair
  let admin: web3.Keypair
  let otherAdmin: web3.Keypair
  let malicious: web3.Keypair

  let deployerProvider: LiteSVMProvider
  let adminProvider: LiteSVMProvider
  let otherAdminProvider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider

  let program: Program<Whitelist>

  let deployerSdk: WhitelistSDK
  let adminSdk: WhitelistSDK
  let otherAdminSdk: WhitelistSDK
  let maliciousSdk: WhitelistSDK

  before(async () => {
    deployer = web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    admin = web3.Keypair.generate()
    otherAdmin = web3.Keypair.generate()
    malicious = web3.Keypair.generate()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()

    deployerProvider = new LiteSVMProvider(client, new Wallet(deployer))
    adminProvider = new LiteSVMProvider(client, new Wallet(admin))
    otherAdminProvider = new LiteSVMProvider(client, new Wallet(otherAdmin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))

    program = new Program<Whitelist>(WhitelistIDL as any, deployerProvider)

    deployerSdk = new WhitelistSDK(deployerProvider)
    adminSdk = new WhitelistSDK(adminProvider)
    otherAdminSdk = new WhitelistSDK(otherAdminProvider)
    maliciousSdk = new WhitelistSDK(maliciousProvider)

    deployerProvider.client.airdrop(deployer.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(admin.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(otherAdmin.publicKey, BigInt(100_000_000_000))
    deployerProvider.client.airdrop(malicious.publicKey, BigInt(100_000_000_000))

    // Warp so that we're not at t=0
    warpSeconds(deployerProvider, 100)
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('Whitelist', () => {
    describe('initialize', () => {
      it('cannot initialize if not deployer', async () => {
        const newAdmin = web3.Keypair.generate().publicKey

        const ix = await maliciousSdk.initializeIx(newAdmin)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only deployer can call this instruction')
      })

      it('should initialize', async () => {
        const ix = await deployerSdk.initializeIx(admin.publicKey)
        await makeTxSignAndSend(deployerProvider, ix)

        const settings = await program.account.globalSettings.fetch(deployerSdk.getGlobalSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('cannot call initialize again', async () => {
        const ix = await deployerSdk.initializeIx(admin.publicKey)
        const res = await makeTxSignAndSend(deployerProvider, ix)

        expectTransactionError(res, 'already in use')
      })
    })

    describe('set_admin', () => {
      it('cannot set admin if not admin', async () => {
        const newAdmin = web3.Keypair.generate().publicKey

        const ix = await maliciousSdk.setAdmin(newAdmin)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })

      it('can set admin', async () => {
        const ix = await adminSdk.setAdmin(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())

        // Reset admin to original for subsequent tests
        const resetIx = await otherAdminSdk.setAdmin(admin.publicKey)
        await makeTxSignAndSend(otherAdminProvider, resetIx)
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

      it('cannot set status if not admin', async () => {
        const ix = await maliciousSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Whitelisted
        )
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
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

      it('should change admin for next tests', async () => {
        const ix = await adminSdk.setAdmin(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await program.account.globalSettings.fetch(adminSdk.getGlobalSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (whitelist to blacklist transition) (validator)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Blacklisted
        )
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (whitelist to blacklist transition) (axia)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia, WhitelistStatus.Blacklisted)
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (whitelist to blacklist transition) (solver)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Solver,
          solver,
          WhitelistStatus.Blacklisted
        )
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver.toString())
        expect(entityRegistry.status).to.deep.include({ blacklisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (validator)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (axia)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should update status correctly (blacklist to whitelist transition) (solver)', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Solver,
          solver,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )
        const now = Number(client.getClock().unixTimestamp)

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.eq(now)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should whitelist another validator', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator2,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator2)
        )
        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(validator2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should whitelist another axia', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(EntityType.Axia, axia2, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia2)
        )
        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(axia2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should whitelist another solver', async () => {
        const ix = await otherAdminSdk.setEntityWhitelistStatusIx(EntityType.Solver, solver2, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(otherAdminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver2)
        )
        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityPubkey.toString()).to.be.eq(solver2.toString())
        expect(entityRegistry.status).to.deep.include({ whitelisted: {} })
        expect(entityRegistry.lastUpdate.toNumber()).to.be.greaterThan(0)
        expect(entityRegistry.updatedBy.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should create separate accounts for same pubkey with different entity types', async () => {
        const ix1 = await otherAdminSdk.setEntityWhitelistStatusIx(EntityType.Validator, axia, WhitelistStatus.Whitelisted)
        await makeTxSignAndSend(otherAdminProvider, ix1)

        const validatorRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
        )
        const axiaRegistry = await program.account.entityRegistry.fetch(
          otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )

        expect(validatorRegistry.entityType).to.deep.include({ validator: {} })
        expect(validatorRegistry.status).to.deep.include({ whitelisted: {} })
        expect(axiaRegistry.entityType).to.deep.include({ axia: {} })
        expect(axiaRegistry.status).to.deep.include({ whitelisted: {} })

        const validatorPda = otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
        const axiaPda = otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        expect(validatorPda.toString()).to.not.eq(axiaPda.toString())
      })
    })
  })
})
