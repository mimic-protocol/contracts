/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet, web3 } from '@coral-xyz/anchor'
import { EntityType, SvmController } from '@mimicprotocol/sdk'
import * as ControllerIDL from '@mimicprotocol/sdk/src/settler/svm/idls/controller.json'
import { Controller } from '@mimicprotocol/sdk/src/settler/svm/idls/types/controller'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import { expectTransactionError, randomKeypair, randomPubkey, toLamports } from './helpers'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Controller', () => {
  let client: LiteSVM

  let deployer: web3.Keypair
  let admin: web3.Keypair
  let otherAdmin: web3.Keypair
  let malicious: web3.Keypair

  let deployerProvider: LiteSVMProvider
  let adminProvider: LiteSVMProvider
  let otherAdminProvider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider

  let program: Program<Controller>

  let deployerSdk: SvmController
  let adminSdk: SvmController
  let otherAdminSdk: SvmController
  let maliciousSdk: SvmController

  before(async () => {
    deployer = web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    admin = randomKeypair()
    otherAdmin = randomKeypair()
    malicious = randomKeypair()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()

    deployerProvider = new LiteSVMProvider(client, new Wallet(deployer))
    adminProvider = new LiteSVMProvider(client, new Wallet(admin))
    otherAdminProvider = new LiteSVMProvider(client, new Wallet(otherAdmin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))

    program = new Program<Controller>(ControllerIDL as any, deployerProvider)

    deployerSdk = new SvmController(deployerProvider)
    adminSdk = new SvmController(adminProvider)
    otherAdminSdk = new SvmController(otherAdminProvider)
    maliciousSdk = new SvmController(maliciousProvider)

    deployerProvider.client.airdrop(deployer.publicKey, toLamports(100))
    deployerProvider.client.airdrop(admin.publicKey, toLamports(100))
    deployerProvider.client.airdrop(otherAdmin.publicKey, toLamports(100))
    deployerProvider.client.airdrop(malicious.publicKey, toLamports(100))

    // Warp so that we're not at t=0
    warpSeconds(deployerProvider, 100)
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('initialize', () => {
    context('when caller is not deployer', async () => {
      it('cannot initialize', async () => {
        const newAdmin = randomPubkey()

        const ix = await maliciousSdk.initializeIx(newAdmin)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only deployer can call this instruction')
      })
    })

    context('when caller is deployer', async () => {
      it('should initialize', async () => {
        const ix = await deployerSdk.initializeIx(admin.publicKey)
        await makeTxSignAndSend(deployerProvider, ix)

        const settings = await program.account.controllerSettings.fetch(deployerSdk.getControllerSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(admin.publicKey.toString())
      })

      it('cannot call initialize again', async () => {
        const ix = await deployerSdk.initializeIx(admin.publicKey)
        const res = await makeTxSignAndSend(deployerProvider, ix)

        expectTransactionError(res, 'already in use')
      })
    })
  })

  describe('set admin', () => {
    context('when caller is not admin', async () => {
      it('cannot set admin', async () => {
        const newAdmin = randomPubkey()

        const ix = await maliciousSdk.setAdmin(newAdmin)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })
    })

    context('when caller is admin', async () => {
      after('reset admin to original for subsequent tests', async () => {
        const resetIx = await otherAdminSdk.setAdmin(admin.publicKey)
        await makeTxSignAndSend(otherAdminProvider, resetIx)
      })

      it('can set admin', async () => {
        const ix = await adminSdk.setAdmin(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })
    })
  })

  describe('EntityRegistry management', () => {
    const validator = randomPubkey()
    const axia = randomPubkey()
    const solver = randomPubkey()
    const validator2 = randomPubkey()
    const axia2 = randomPubkey()
    const solver2 = randomPubkey()

    context('when the caller is not admin', async () => {
      it('cannot create registry', async () => {
        const ix = await maliciousSdk.setAllowedEntityIx(EntityType.Validator, validator)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })
    })

    context('when the caller is admin', async () => {
      it('should create entity registry successfully (validator)', async () => {
        const ix = await adminSdk.setAllowedEntityIx(EntityType.Validator, validator)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
        )

        expect(entityRegistry.entityType).to.deep.include({ validator: {} })
        expect(entityRegistry.entityAddress).to.be.deep.eq(validator.toBuffer())
      })

      it('should create entity registry successfully (axia)', async () => {
        const ix = await adminSdk.setAllowedEntityIx(EntityType.Axia, axia)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityAddress).to.be.deep.eq(axia.toBuffer())
      })

      it('should create entity registry successfully (solver)', async () => {
        const ix = await adminSdk.setAllowedEntityIx(EntityType.Solver, solver)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityAddress).to.be.deep.eq(solver.toBuffer())
      })

      it('should change admin for next tests', async () => {
        const ix = await adminSdk.setAdmin(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })

      it('should close entity registry (validator)', async () => {
        const ix = await otherAdminSdk.closeEntityRegistryIx(EntityType.Validator, validator)
        await makeTxSignAndSend(otherAdminProvider, ix)

        try {
          await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
          )
          expect.fail('Entity registry should not exist after closing')
        } catch (error: any) {
          expect(error.message).to.include('Account does not exist')
        }
      })

      it('should create entity registry successfully (axia)', async () => {
        const ix = await adminSdk.setAllowedEntityIx(EntityType.Axia, axia)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
        )

        expect(entityRegistry.entityType).to.deep.include({ axia: {} })
        expect(entityRegistry.entityAddress).to.be.deep.eq(axia.toBuffer())
      })

      it('should create entity registry successfully (solver)', async () => {
        const ix = await adminSdk.setAllowedEntityIx(EntityType.Solver, solver)
        await makeTxSignAndSend(adminProvider, ix)

        const entityRegistry = await program.account.entityRegistry.fetch(
          adminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
        )

        expect(entityRegistry.entityType).to.deep.include({ solver: {} })
        expect(entityRegistry.entityAddress).to.be.deep.eq(solver.toBuffer())
      })
    })

    context('when the admin is changed and caller is new admin', async () => {
      before('change admin for next tests', async () => {
        const ix = await adminSdk.setAdmin(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)
      })

      context('when the admin was changed', async () => {
        it('should have the new admin as admin', async () => {
          const settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
          expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())
        })
      })

      context('when closing entity registries', async () => {
        it('should close entity registry (validator)', async () => {
          const ix = await otherAdminSdk.closeEntityRegistryIx(EntityType.Validator, validator)
          await makeTxSignAndSend(otherAdminProvider, ix)

          try {
            await program.account.entityRegistry.fetch(
              otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
            )
            expect.fail('Entity registry should not exist after closing')
          } catch (error: any) {
            expect(error.message).to.include('Account does not exist')
          }
        })

        it('should close entity registry (axia)', async () => {
          const ix = await otherAdminSdk.closeEntityRegistryIx(EntityType.Axia, axia)
          await makeTxSignAndSend(otherAdminProvider, ix)

          try {
            await program.account.entityRegistry.fetch(otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia))
            expect.fail('Entity registry should not exist after closing')
          } catch (error: any) {
            expect(error.message).to.include('Account does not exist')
          }
        })

        it('should close entity registry (solver)', async () => {
          const ix = await otherAdminSdk.closeEntityRegistryIx(EntityType.Solver, solver)
          await makeTxSignAndSend(otherAdminProvider, ix)

          try {
            await program.account.entityRegistry.fetch(otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver))
            expect.fail('Entity registry should not exist after closing')
          } catch (error: any) {
            expect(error.message).to.include('Account does not exist')
          }
        })
      })

      context('when allowing entities after closing their registries', async () => {
        it('should create entity registry after closing (validator)', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Validator, validator)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator)
          )

          expect(entityRegistry.entityType).to.deep.include({ validator: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(validator.toBuffer())
        })

        it('should create entity registry after closing (axia)', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Axia, axia)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
          )

          expect(entityRegistry.entityType).to.deep.include({ axia: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(axia.toBuffer())
        })

        it('should create entity registry after closing (solver)', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Solver, solver)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver)
          )

          expect(entityRegistry.entityType).to.deep.include({ solver: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(solver.toBuffer())
        })
      })

      context('when allowing other entities', async () => {
        it('should create another validator registry', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Validator, validator2)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, validator2)
          )
          expect(entityRegistry.entityType).to.deep.include({ validator: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(validator2.toBuffer())
        })

        it('should create another axia registry', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Axia, axia2)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia2)
          )
          expect(entityRegistry.entityType).to.deep.include({ axia: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(axia2.toBuffer())
        })

        it('should create another solver registry', async () => {
          const ix = await otherAdminSdk.setAllowedEntityIx(EntityType.Solver, solver2)
          await makeTxSignAndSend(otherAdminProvider, ix)

          const entityRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Solver, solver2)
          )
          expect(entityRegistry.entityType).to.deep.include({ solver: {} })
          expect(entityRegistry.entityAddress).to.be.deep.eq(solver2.toBuffer())
        })
      })

      context('when allowing entities for multiple roles', async () => {
        it('should create separate accounts for same pubkey with different entity types', async () => {
          const ix1 = await otherAdminSdk.setAllowedEntityIx(EntityType.Validator, axia)
          await makeTxSignAndSend(otherAdminProvider, ix1)

          const validatorRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
          )
          const axiaRegistry = await program.account.entityRegistry.fetch(
            otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
          )

          expect(validatorRegistry.entityType).to.deep.include({ validator: {} })
          expect(axiaRegistry.entityType).to.deep.include({ axia: {} })

          const validatorPda = otherAdminSdk.getEntityRegistryPubkey(EntityType.Validator, axia)
          const axiaPda = otherAdminSdk.getEntityRegistryPubkey(EntityType.Axia, axia)
          expect(validatorPda.toString()).to.not.eq(axiaPda.toString())
        })
      })
    })
  })
})
