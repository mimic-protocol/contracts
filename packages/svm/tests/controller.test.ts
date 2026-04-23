/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet, web3 } from '@coral-xyz/anchor'
import { EntityType, SvmController } from '@mimicprotocol/sdk'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { AccountInfoBytes, LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import * as ControllerIDL from '../target/idl/controller.json'
import { Controller } from '../target/types/controller'
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

        const ix = await maliciousSdk.initializeIx(newAdmin, 1)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only deployer can call this instruction')
      })
    })

    context('when caller is deployer', async () => {
      context('when min validations are not valid', () => {
        context('when min validations are 0', () => {
          it('throws an error', async () => {
            const ix = await deployerSdk.initializeIx(admin.publicKey, 0)
            const res = await makeTxSignAndSend(deployerProvider, ix)

            expectTransactionError(res, 'Min validations cannot be zero')
          })
        })

        context('when min validations are less than 0', () => {
          it('throws an error', async () => {
            try {
              await deployerSdk.initializeIx(admin.publicKey, -1)
            } catch (e) {
              expect(String(e)).to.be.eq(
                'RangeError [ERR_OUT_OF_RANGE]: The value of "value" is out of range. It must be >= 0 and <= 65535. Received -1'
              )
            }
          })
        })
      })

      context('when min validations are valid', async () => {
        const minValidations = 2

        it('should initialize', async () => {
          const ix = await deployerSdk.initializeIx(admin.publicKey, minValidations)
          await makeTxSignAndSend(deployerProvider, ix)

          const settings = await program.account.controllerSettings.fetch(deployerSdk.getControllerSettingsPubkey())
          expect(settings.admin.toString()).to.be.eq(admin.publicKey.toString())
          expect(settings.minValidations).to.be.eq(minValidations)
        })

        it('cannot call initialize again', async () => {
          const ix = await deployerSdk.initializeIx(admin.publicKey, minValidations)
          const res = await makeTxSignAndSend(deployerProvider, ix)

          expectTransactionError(res, 'already in use')
        })
      })
    })
  })

  describe('set_admin', () => {
    context('when caller is not admin', async () => {
      it('cannot set admin', async () => {
        const newAdmin = randomPubkey()

        const ix = await maliciousSdk.setAdminIx(newAdmin)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })
    })

    context('when caller is admin', async () => {
      after('reset admin to original for subsequent tests', async () => {
        const resetIx = await otherAdminSdk.setAdminIx(admin.publicKey)
        await makeTxSignAndSend(otherAdminProvider, resetIx)
      })

      it('can set admin', async () => {
        const ix = await adminSdk.setAdminIx(otherAdmin.publicKey)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
        expect(settings.admin.toString()).to.be.eq(otherAdmin.publicKey.toString())
      })
    })
  })

  describe('set_min_validations', () => {
    context('when caller is not admin', () => {
      it('throws an error', async () => {
        const ix = await maliciousSdk.setMinValidationsIx(2)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })
    })

    context('when caller is admin', () => {
      context('when min validations are not valid', () => {
        context('when min validations are zero', () => {
          it('throws an error', async () => {
            const ix = await adminSdk.setMinValidationsIx(0)
            const res = await makeTxSignAndSend(adminProvider, ix)

            expectTransactionError(res, 'Min validations cannot be zero')
          })
        })

        context('when min validations are less than zero', () => {
          it('throws an error', async () => {
            try {
              await adminSdk.setMinValidationsIx(-1)
            } catch (e) {
              expect(String(e)).to.be.eq(
                'RangeError [ERR_OUT_OF_RANGE]: The value of "value" is out of range. It must be >= 0 and <= 65535. Received -1'
              )
            }
          })
        })
      })

      context('when min validations are valid', () => {
        it('sets min validations', async () => {
          const newMinValidations = 1

          let settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
          expect(settings.minValidations).to.not.be.eq(newMinValidations)

          const ix = await adminSdk.setMinValidationsIx(newMinValidations)
          await makeTxSignAndSend(adminProvider, ix)

          settings = await program.account.controllerSettings.fetch(adminSdk.getControllerSettingsPubkey())
          expect(settings.minValidations).to.be.eq(newMinValidations)
        })
      })
    })
  })

  describe('resize_settings', () => {
    context('when caller is not admin', () => {
      it('throws an error', async () => {
        const ix = await maliciousSdk.resizeSettings()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only admin can call this instruction')
      })
    })

    context('when caller is admin', () => {
      const itIsIdempotent = () => {
        it('is idempotent', async () => {
          const settingsBefore = client.getAccount(adminSdk.getControllerSettingsPubkey())

          const ix = await adminSdk.resizeSettings()
          await makeTxSignAndSend(adminProvider, ix)

          const settingsAfter = client.getAccount(adminSdk.getControllerSettingsPubkey())

          expect(settingsBefore).to.not.be.undefined
          expect(settingsAfter).to.not.be.undefined
          expect(settingsAfter!.data.length).to.be.eq(settingsBefore!.data.length)
        })
      }

      context('when settings are not correct size', () => {
        context('when settings are larger', () => {
          // NOTE: This is an impossible case, but we test it nevertheless just in case.
          // Given the scenario where the settings grew larger than the minimum size for
          // some reason, calling this instruction still does not truncate the PDA as
          // doing that would imply potential data loss.

          let controllerSettingsAccount: AccountInfoBytes

          beforeEach('Mock large ControllerSettings PDA (impossible scenario)', () => {
            const controllerSettingsKey = adminSdk.getControllerSettingsPubkey()
            controllerSettingsAccount = client.getAccount(controllerSettingsKey)!

            const mockSettings = {
              ...controllerSettingsAccount,
              data: Uint8Array.from(Array(1000)),
            }

            client.setAccount(adminSdk.getControllerSettingsPubkey(), mockSettings)
          })

          itIsIdempotent()

          afterEach('Restore PDA', () => {
            client.setAccount(adminSdk.getControllerSettingsPubkey(), controllerSettingsAccount)
          })
        })

        context('when settings are smaller', () => {
          let controllerSettingsAccount: AccountInfoBytes

          beforeEach('Mock large ControllerSettings PDA (e.g. after a program upgrade)', () => {
            const controllerSettingsKey = adminSdk.getControllerSettingsPubkey()
            controllerSettingsAccount = client.getAccount(controllerSettingsKey)!

            const mockSettings = {
              ...controllerSettingsAccount,
              data: controllerSettingsAccount.data.slice(0, controllerSettingsAccount.data.length - 2),
            }

            client.setAccount(adminSdk.getControllerSettingsPubkey(), mockSettings)
          })

          it('resizes settings', async () => {
            const settingsBefore = client.getAccount(adminSdk.getControllerSettingsPubkey())

            const ix = await adminSdk.resizeSettings()
            await makeTxSignAndSend(adminProvider, ix)

            const settingsAfter = client.getAccount(adminSdk.getControllerSettingsPubkey())

            expect(settingsBefore).to.not.be.undefined
            expect(settingsAfter).to.not.be.undefined
            expect(settingsAfter!.data.length).to.be.greaterThan(settingsBefore!.data.length)
          })

          afterEach('Restore PDA', () => {
            client.setAccount(adminSdk.getControllerSettingsPubkey(), controllerSettingsAccount)
          })
        })
      })

      context('when settings are correct size', () => {
        itIsIdempotent()
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
        const ix = await adminSdk.setAdminIx(otherAdmin.publicKey)
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
        const ix = await adminSdk.setAdminIx(otherAdmin.publicKey)
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
