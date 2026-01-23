/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { signAsync } from '@noble/ed25519'
import { Ed25519Program, Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import ControllerSDK, { EntityType } from '../sdks/controller/Controller'
import SettlerSDK from '../sdks/settler/Settler'
import { CreateIntentParams, OpType, ProposalInstruction, TokenFee } from '../sdks/settler/types'
import * as ControllerIDL from '../target/idl/controller.json'
import * as SettlerIDL from '../target/idl/settler.json'
import { Settler } from '../target/types/settler'
import {
  ACCOUNT_CLOSE_FEE,
  DEFAULT_DATA_HEX,
  DEFAULT_EVENT_DATA_HEX,
  DEFAULT_MAX_FEE,
  DEFAULT_MAX_FEE_EXCEED,
  DEFAULT_MAX_FEE_HALF,
  DEFAULT_MIN_VALIDATIONS,
  DEFAULT_TOPIC_HEX,
  DOUBLE_CLAIM_DELAY,
  DOUBLE_CLAIM_DELAY_PLUS_ONE,
  EMPTY_DATA_HEX,
  EXPIRATION_TEST_DELAY,
  EXPIRATION_TEST_DELAY_PLUS_ONE,
  INTENT_DEADLINE_OFFSET,
  LONG_DEADLINE,
  MEDIUM_DEADLINE,
  MULTIPLE_MIN_VALIDATIONS,
  PROPOSAL_DEADLINE_OFFSET,
  SHORT_DEADLINE,
  STALE_CLAIM_DELAY,
  STALE_CLAIM_DELAY_PLUS_ONE,
  TEST_DATA_HEX_1,
  TEST_DATA_HEX_2,
  TEST_DATA_HEX_3,
  VERY_SHORT_DEADLINE,
  WARP_TIME_LONG,
  WARP_TIME_SHORT,
} from './helpers/constants'
import {
  addValidatorsToIntent,
  createAllowlistedEntity,
  createAxiaSignature,
  createFinalizedProposal,
  createIntentParams,
  createTestIntent,
  createValidatedIntent,
  createValidatorSignature,
  expectTransactionError,
  generateIntentHash,
  generateNonce,
} from './helpers/helpers'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Settler Program', () => {
  let client: LiteSVM

  let provider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider
  let solverProvider: LiteSVMProvider

  let admin: Keypair
  let malicious: Keypair
  let solver: Keypair

  let program: Program<Settler>

  let sdk: SettlerSDK
  let maliciousSdk: SettlerSDK
  let solverSdk: SettlerSDK

  let controllerSdk: ControllerSDK

  before(async () => {
    admin = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    malicious = Keypair.generate()
    solver = Keypair.generate()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins().withPrecompiles().withSysvars()

    provider = new LiteSVMProvider(client, new Wallet(admin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))
    solverProvider = new LiteSVMProvider(client, new Wallet(solver))

    program = new Program<Settler>(SettlerIDL as any, provider)

    sdk = new SettlerSDK(provider)
    maliciousSdk = new SettlerSDK(maliciousProvider)
    solverSdk = new SettlerSDK(solverProvider)

    provider.client.airdrop(admin.publicKey, BigInt(100_000_000_000))
    provider.client.airdrop(malicious.publicKey, BigInt(100_000_000_000))
    provider.client.airdrop(solver.publicKey, BigInt(100_000_000_000))

    // Initialize Controller and add Solver to allowlist
    controllerSdk = new ControllerSDK(provider)
    await makeTxSignAndSend(provider, await controllerSdk.initializeIx(admin.publicKey))
    await makeTxSignAndSend(provider, await controllerSdk.setAllowedEntityIx(EntityType.Solver, solver.publicKey))
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('initialize', () => {
    context('when caller is not deployer', () => {
      it('cannot initialize if not deployer', async () => {
        const ix = await maliciousSdk.initializeIx()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only Deployer can call this instruction.')
      })
    })

    context('when caller is deployer', () => {
      it('should call initialize', async () => {
        const ix = await sdk.initializeIx()
        await makeTxSignAndSend(provider, ix)

        const settings = await program.account.settlerSettings.fetch(sdk.getSettlerSettingsPubkey())
        expect(settings.controllerProgram.toString()).to.be.eq(ControllerIDL.address)
      })

      it('cannot call initialize again', async () => {
        const ix = await sdk.initializeIx()
        const res = await makeTxSignAndSend(provider, ix)

        expectTransactionError(res, 'already in use')
      })
    })
  })

  describe('create_intent', () => {
    context('when creating a valid intent', () => {
      context('when creating a basic intent', () => {
        let intentHash: string
        let user: Keypair
        let nonce: string
        let deadline: number

        beforeEach('create intent', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            op: OpType.Transfer,
          })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          user = { publicKey: intent.user } as Keypair
          nonce = Buffer.from(intent.nonce).toString('hex')
          deadline = intent.deadline.toNumber()
        })

        it('creates the intent with correct properties', async () => {
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.op).to.deep.include({ transfer: {} })
          expect(intent.user.toString()).to.be.eq(user.publicKey.toString())
          expect(intent.creator.toString()).to.be.eq(solver.publicKey.toString())
          expect(Buffer.from(intent.nonce).toString('hex')).to.be.eq(nonce)
          expect(intent.deadline.toNumber()).to.be.eq(deadline)
          expect(intent.minValidations).to.be.eq(DEFAULT_MIN_VALIDATIONS)
          expect(intent.isFinal).to.be.false
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq(DEFAULT_DATA_HEX)
          expect(intent.maxFees.length).to.be.eq(1)
          expect(intent.maxFees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE)
          expect(intent.events.length).to.be.eq(1)
          expect(intent.validators.length).to.be.eq(0)
          expect(Buffer.from(intent.events[0].data).toString('hex')).to.be.eq(DEFAULT_EVENT_DATA_HEX)
        })
      })

      context('when creating an intent with empty data', () => {
        let intentHash: string

        beforeEach('create intent with empty data', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            op: OpType.Swap,
            minValidations: 2,
            dataHex: EMPTY_DATA_HEX,
            maxFees: [
              {
                mint: Keypair.generate().publicKey,
                amount: 2000,
              },
            ],
            eventsHex: [],
            isFinal: true,
          })
        })

        it('creates the intent with empty data', async () => {
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.op).to.deep.include({ swap: {} })
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq(EMPTY_DATA_HEX)
          expect(intent.isFinal).to.be.true
        })
      })

      context('when creating an intent with empty events', () => {
        let intentHash: string

        beforeEach('create intent with empty events', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            dataHex: TEST_DATA_HEX_2,
            eventsHex: [],
          })
        })

        it('creates the intent with empty events', async () => {
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.events.length).to.be.eq(0)
        })
      })

      context('when creating an intent with is_final true', () => {
        let intentHash: string

        beforeEach('create intent with is_final true', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            dataHex: EMPTY_DATA_HEX,
            eventsHex: [],
            isFinal: true,
          })
        })

        it('creates the intent with is_final true', async () => {
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.isFinal).to.be.true
        })
      })

      context('when creating an intent with is_final false', () => {
        let intentHash: string

        beforeEach('create intent with is_final false', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            dataHex: EMPTY_DATA_HEX,
            eventsHex: [],
            isFinal: false,
          })
        })

        it('creates the intent with is_final false', async () => {
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.isFinal).to.be.false
        })
      })
    })

    context('when validation fails', () => {
      context('when intent has empty max_fees', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        const itThrowsAnError = (errorMessage: string) => {
          it('throws an error', async () => {
            const params = createIntentParams(client, intentParams)
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, errorMessage)
          })
        }

        beforeEach('create intent params with empty max_fees', async () => {
          intentHash = generateIntentHash()
          intentParams = {
            op: OpType.Call,
            minValidations: MULTIPLE_MIN_VALIDATIONS,
            dataHex: TEST_DATA_HEX_1,
            maxFees: [],
            eventsHex: [],
          }
        })

        itThrowsAnError('No max fees provided')
      })

      context('when intent has invalid hash', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        beforeEach('create intent params with invalid hash', async () => {
          intentHash = '123456' // invalid - not 32 bytes
          intentParams = {}
        })

        it('throws an error', async () => {
          const params = createIntentParams(client, intentParams)
          try {
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            await makeTxSignAndSend(solverProvider, ix)
            expect.fail('Should have thrown an error')
          } catch (error: any) {
            expect(error.message).to.include(`Intent hash must be 32 bytes`)
          }
        })
      })
    })

    context('when caller is not allowlisted solver', () => {
      let intentHash: string
      let intentParams: Partial<CreateIntentParams> = {}

      beforeEach('create intent params', async () => {
        intentHash = generateIntentHash()
        intentParams = {}
      })

      it('throws an error', async () => {
        const params = createIntentParams(client, intentParams)
        const ix = await maliciousSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')

        const intent = client.getAccount(sdk.getIntentKey(intentHash))
        expect(intent).to.be.null
      })
    })

    context('when deadline is invalid', () => {
      context('when deadline is in the past', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        const itThrowsAnError = (errorMessage: string) => {
          it('throws an error', async () => {
            const params = createIntentParams(client, intentParams)
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, errorMessage)
          })
        }

        beforeEach('create intent params with past deadline', async () => {
          warpSeconds(provider, WARP_TIME_LONG)
          intentHash = generateIntentHash()
          const now = Number(client.getClock().unixTimestamp)
          intentParams = {
            deadline: now - SHORT_DEADLINE,
          }
        })

        itThrowsAnError('Deadline must be in the future')
      })

      context('when deadline equals now', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        const itThrowsAnError = (errorMessage: string) => {
          it('throws an error', async () => {
            const params = createIntentParams(client, intentParams)
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, errorMessage)
          })
        }

        beforeEach('create intent params with deadline equal to now', async () => {
          intentHash = generateIntentHash()
          const now = Number(client.getClock().unixTimestamp)
          intentParams = {
            deadline: now,
          }
        })

        itThrowsAnError('Deadline must be in the future')
      })
    })

    context('when intent already exists', () => {
      context('when fulfilled_intent PDA already exists', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        const itThrowsAnError = (errorMessage: string) => {
          it('throws an error', async () => {
            const params = createIntentParams(client, intentParams)
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, errorMessage)
          })
        }

        beforeEach('create intent params and mock fulfilled intent', async () => {
          intentHash = generateIntentHash()
          intentParams = {}
          // Mock FulfilledIntent
          const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
          client.setAccount(fulfilledIntent, {
            executable: false,
            lamports: 1002240,
            owner: program.programId,
            data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
          })
        })

        itThrowsAnError('AccountNotSystemOwned')
      })

      context('when intent with same hash already exists', () => {
        let intentHash: string
        let intentParams: Partial<CreateIntentParams> = {}

        const itThrowsAnError = (errorMessage: string) => {
          it('throws an error', async () => {
            const params = createIntentParams(client, intentParams)
            const ix = await solverSdk.createIntentIx(intentHash, params, false)
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, errorMessage)
          })
        }

        beforeEach('create existing intent', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            isFinal: false,
          })
          client.expireBlockhash()
          intentParams = {}
        })

        itThrowsAnError('already in use')
      })
    })
  })

  describe('extend_intent', () => {
    context('when extending with valid data', () => {
      context('when extending with more data', () => {
        let intentHash: string
        let extendParams: { moreDataHex: string }

        beforeEach('create intent and extend params', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            isFinal: false,
          })
          extendParams = {
            moreDataHex: TEST_DATA_HEX_1,
          }
        })

        it('extends the intent with more data', async () => {
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq('010203070809')
          expect(intent.isFinal).to.be.false
        })
      })

      context('when extending with more max_fees', () => {
        let intentHash: string
        let newMint: Keypair
        let extendParams: { moreMaxFees: Array<{ mint: PublicKey; amount: number }> }

        beforeEach('create intent and extend params', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
          newMint = Keypair.generate()
          extendParams = {
            moreMaxFees: [
              {
                mint: newMint.publicKey,
                amount: 2000,
              },
            ],
          }
        })

        it('extends the intent with more max_fees', async () => {
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.maxFees.length).to.be.eq(2)
          expect(intent.maxFees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE)
          expect(intent.maxFees[1].mint.toString()).to.be.eq(newMint.publicKey.toString())
          expect(intent.maxFees[1].amount.toNumber()).to.be.eq(2000)
        })
      })

      context('when extending with more events', () => {
        let intentHash: string
        let newTopic: string
        let extendParams: { moreEventsHex: Array<{ topicHex: string; dataHex: string }> }

        beforeEach('create intent and extend params', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
          newTopic = Buffer.from(Array(32).fill(2)).toString('hex')
          extendParams = {
            moreEventsHex: [
              {
                topicHex: newTopic,
                dataHex: TEST_DATA_HEX_2,
              },
            ],
          }
        })

        it('extends the intent with more events', async () => {
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.events.length).to.be.eq(2)
          expect(Buffer.from(intent.events[0].topic).toString('hex')).to.be.eq(
            Buffer.from(Array(32).fill(1)).toString('hex')
          )
          expect(Buffer.from(intent.events[1].topic).toString('hex')).to.be.eq(newTopic)
          expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq('0a0b0c')
        })
      })

      context('when extending with all optional fields', () => {
        let intentHash: string
        let newMint: Keypair
        let newTopic: string
        let extendParams: {
          moreDataHex: string
          moreMaxFees: Array<{ mint: PublicKey; amount: number }>
          moreEventsHex: Array<{ topicHex: string; dataHex: string }>
        }

        beforeEach('create intent and extend params', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
          newMint = Keypair.generate()
          newTopic = Buffer.from(Array(32).fill(3)).toString('hex')
          extendParams = {
            moreDataHex: '0d0e0f',
            moreMaxFees: [
              {
                mint: newMint.publicKey,
                amount: 3000,
              },
            ],
            moreEventsHex: [
              {
                topicHex: newTopic,
                dataHex: '101112',
              },
            ],
          }
        })

        it('extends the intent with all optional fields', async () => {
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq('0102030d0e0f')
          expect(intent.maxFees.length).to.be.eq(2)
          expect(intent.maxFees[1].amount.toNumber()).to.be.eq(3000)
          expect(intent.events.length).to.be.eq(2)
          expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq('101112')
        })
      })

      context('when extending to large size', () => {
        let intentHash: string
        let intentKey: PublicKey

        beforeEach('create intent', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
          intentKey = sdk.getIntentKey(intentHash)
        })

        it('extends the intent to a large size', async () => {
          for (let i = 0; i < 100; i++) {
            const ix = await solverSdk.extendIntentIx(intentHash, { moreDataHex: 'f'.repeat(100) }, false)
            await makeTxSignAndSend(solverProvider, ix)
            client.expireBlockhash()
          }

          for (let i = 0; i < 25; i++) {
            const extendParams = {
              moreEventsHex: [
                { topicHex: 'e'.repeat(64), dataHex: 'beef'.repeat(100) },
                { topicHex: 'd'.repeat(64), dataHex: 'beef'.repeat(100) },
              ],
            }
            const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
            await makeTxSignAndSend(solverProvider, ix)
            client.expireBlockhash()
          }

          for (let i = 0; i < 19; i++) {
            const extendParams = {
              moreMaxFees: [
                { mint: Keypair.generate().publicKey, amount: i },
                { mint: Keypair.generate().publicKey, amount: i + 1000 },
                { mint: Keypair.generate().publicKey, amount: i + 2000 },
              ],
            }
            const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
            await makeTxSignAndSend(solverProvider, ix)
            client.expireBlockhash()
          }

          const intent = await program.account.intent.fetch(intentKey)
          const intentAcc = client.getAccount(intentKey)
          expect(intent.data.length).to.be.eq(3 + 5000) // Keep literal for specific test case
          expect(intent.maxFees.length).to.be.eq(58)
          expect(intent.events.length).to.be.eq(51)
          expect(intent.isFinal).to.be.false
          expect(intentAcc?.data.length).to.be.eq(19359)
        })
      })

      context('when finalizing an intent', () => {
        let intentHash: string

        beforeEach('create intent', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        })

        it('finalizes the intent', async () => {
          const extendParams = {}
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(intent.isFinal).to.be.true
        })
      })

      context('when extending and finalizing in one call', () => {
        let intentHash: string
        let extendParams: { moreDataHex: string }

        beforeEach('create intent and extend params', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
          extendParams = {
            moreDataHex: '191a1b',
          }
        })

        it('extends and finalizes the intent in one call', async () => {
          const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
          await makeTxSignAndSend(solverProvider, ix)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq('010203191a1b')
          expect(intent.isFinal).to.be.true
        })
      })

      context('when extending multiple times', () => {
        let intentHash: string

        beforeEach('create intent', async () => {
          intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        })

        it('extends the intent multiple times', async () => {
          const extendParams1 = {
            moreDataHex: '1c1d1e',
          }
          const ix1 = await solverSdk.extendIntentIx(intentHash, extendParams1, false)
          await makeTxSignAndSend(solverProvider, ix1)

          const extendParams2 = {
            moreDataHex: '1f2021',
          }
          const ix2 = await solverSdk.extendIntentIx(intentHash, extendParams2, false)
          await makeTxSignAndSend(solverProvider, ix2)

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect(Buffer.from(intent.data).toString('hex')).to.be.eq('0102031c1d1e1f2021')
          expect(intent.isFinal).to.be.false
        })
      })
    })

    context('when caller is not intent creator', () => {
      let intentHash: string
      let extendParams: { moreDataHex: string }

      beforeEach('create intent and extend params', async () => {
        intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        extendParams = {
          moreDataHex: '222324',
        }
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be intent creator`)
      })
    })

    context('when intent does not exist', () => {
      let intentHash: string
      let extendParams: { moreDataHex: string }

      beforeEach('generate non-existent intent hash and extend params', () => {
        intentHash = generateIntentHash()
        extendParams = {
          moreDataHex: '252627',
        }
      })

      it('throws an error', async () => {
        const ix = await sdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(provider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when intent is already finalized', () => {
      let intentHash: string
      let extendParams: { moreDataHex: string }

      beforeEach('create finalized intent and extend params', async () => {
        intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
        extendParams = {
          moreDataHex: TEST_DATA_HEX_1,
        }
      })

      it('throws an error', async () => {
        const extendParams = {
          moreDataHex: '28292a',
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Intent is already final`)
      })

      it('throws an error when trying to finalize again', async () => {
        const extendParams = {}
        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, `Intent is already final`)
      })
    })
  })

  describe('claim_stale_intent', () => {
    context('when intent is stale', () => {
      let intentHash: string
      let intentBefore: any
      let intentBalanceBefore: number
      let intentCreatorBalanceBefore: number

      beforeEach('create stale intent and get balances', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        intentHash = await createTestIntent(solverSdk, solverProvider, {
          deadline,
          isFinal: false,
        })

        intentBefore = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        intentBalanceBefore = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
        intentCreatorBalanceBefore = Number(provider.client.getBalance(intentBefore.creator)) || 0

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)
      })

      it('claims the stale intent', async () => {
        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)

        const intentBalanceAfter = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
        const intentCreatorBalanceAfter = Number(provider.client.getBalance(intentBefore.creator)) || 0

        try {
          await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect.fail('Intent account should be closed')
        } catch (error: any) {
          expect(error.message).to.include(`Account does not exist`)
        }

        expect(intentCreatorBalanceAfter).to.be.eq(intentCreatorBalanceBefore + intentBalanceBefore - ACCOUNT_CLOSE_FEE)
        expect(intentBalanceAfter).to.be.eq(0)
      })
    })

    context('when deadline has not passed', () => {
      context('when deadline has not passed', () => {
        let intentHash: string

        beforeEach('create intent and warp time', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + LONG_DEADLINE
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            deadline,
            isFinal: false,
          })
          warpSeconds(provider, WARP_TIME_SHORT)
        })

        it('throws an error', async () => {
          const ix = await solverSdk.claimStaleIntentIx(intentHash)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, 'Intent not yet expired')
        })
      })

      context('when deadline equals now', () => {
        let intentHash: string

        beforeEach('create intent and warp time', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + MEDIUM_DEADLINE
          intentHash = await createTestIntent(solverSdk, solverProvider, {
            deadline,
            isFinal: false,
          })
          warpSeconds(provider, MEDIUM_DEADLINE)
        })

        it('throws an error', async () => {
          const ix = await solverSdk.claimStaleIntentIx(intentHash)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, 'Intent not yet expired')
        })
      })
    })

    context('when caller is not intent creator', () => {
      let intentHash: string

      beforeEach('create intent and warp time', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + EXPIRATION_TEST_DELAY
        intentHash = await createTestIntent(solverSdk, solverProvider, {
          deadline,
          isFinal: false,
        })
        warpSeconds(provider, EXPIRATION_TEST_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, `Signer must be intent creator`)
      })
    })

    context('when intent does not exist', () => {
      let intentHash: string

      beforeEach('generate non-existent intent hash', () => {
        intentHash = generateIntentHash()
      })

      it('throws an error', async () => {
        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when claiming twice', () => {
      let intentHash: string

      beforeEach('create intent, warp time, and claim once', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + DOUBLE_CLAIM_DELAY
        intentHash = await createTestIntent(solverSdk, solverProvider, {
          deadline,
          isFinal: false,
        })
        warpSeconds(provider, DOUBLE_CLAIM_DELAY_PLUS_ONE)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)
        client.expireBlockhash()
      })

      it('throws an error', async () => {
        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)
        const errorMsg = res.toString()
        expect(errorMsg.includes(`AccountNotInitialized`)).to.be.true
      })
    })
  })

  describe('create_proposal', () => {
    context('when creating a valid proposal', () => {
      context('when creating a basic proposal', () => {
        let intentHash: string
        let intent: any
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent and proposal params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [
                {
                  pubkey: Keypair.generate().publicKey,
                  isSigner: false,
                  isWritable: true,
                },
              ],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('creates the proposal', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          if (res instanceof FailedTransactionMetadata) {
            throw new Error(`Failed to create proposal: ${res.toString()}`)
          }

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.intent.toString()).to.be.eq(sdk.getIntentKey(intentHash).toString())
          expect(proposal.creator.toString()).to.be.eq(solver.publicKey.toString())
          expect(proposal.deadline.toNumber()).to.be.eq(deadline)
          expect(proposal.isFinal).to.be.true
          expect(proposal.instructions.length).to.be.eq(1)
          expect(proposal.instructions[0].programId.toString()).to.be.eq(instructions[0].programId.toString())
          expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq('deadbeef')
          expect(proposal.instructions[0].accounts.length).to.be.eq(1)
          expect(proposal.instructions[0].accounts[0].pubkey.toString()).to.be.eq(
            instructions[0].accounts[0].pubkey.toString()
          )
          expect(proposal.instructions[0].accounts[0].isSigner).to.be.eq(false)
          expect(proposal.instructions[0].accounts[0].isWritable).to.be.eq(true)
        })
      })

      context('when creating a proposal with multiple instructions', () => {
        let intentHash: string
        let intent: any
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent and proposal params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [
                {
                  pubkey: Keypair.generate().publicKey,
                  isSigner: false,
                  isWritable: true,
                },
              ],
              data: '010203',
            },
            {
              programId: Keypair.generate().publicKey,
              accounts: [
                {
                  pubkey: Keypair.generate().publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              data: '040506',
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('creates the proposal with multiple instructions', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          if (res instanceof FailedTransactionMetadata) {
            throw new Error(`Failed to create proposal: ${res.toString()}`)
          }

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.instructions.length).to.be.eq(2)
          expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq('010203')
          expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('040506')
          expect(proposal.isFinal).to.be.true
          expect(proposal.instructions[0].accounts.length).to.be.eq(1)
          expect(proposal.instructions[0].accounts[0].pubkey.toString()).to.be.eq(
            instructions[0].accounts[0].pubkey.toString()
          )
          expect(proposal.instructions[0].accounts[0].isSigner).to.be.eq(false)
          expect(proposal.instructions[0].accounts[0].isWritable).to.be.eq(true)
          expect(proposal.instructions[1].accounts.length).to.be.eq(1)
          expect(proposal.instructions[1].accounts[0].pubkey.toString()).to.be.eq(
            instructions[1].accounts[0].pubkey.toString()
          )
          expect(proposal.instructions[1].accounts[0].isSigner).to.be.eq(true)
          expect(proposal.instructions[1].accounts[0].isWritable).to.be.eq(false)
        })
      })

      context('when creating a proposal with empty instructions', () => {
        let intentHash: string
        let intent: any
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent and proposal params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          instructions = []

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('creates the proposal with empty instructions', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          if (res instanceof FailedTransactionMetadata) {
            throw new Error(`Failed to create proposal: ${res.toString()}`)
          }

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.instructions.length).to.be.eq(0)
        })
      })

      context('when creating proposal with fees matching intent max_fees', () => {
        let intentHash: string
        let mint: Keypair
        let proposalDeadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent and proposal params', async () => {
          mint = Keypair.generate()
          const intentParams: Partial<CreateIntentParams> = {
            maxFees: [
              {
                mint: mint.publicKey,
                amount: DEFAULT_MAX_FEE,
              },
            ],
            eventsHex: [],
          }
          const params = createIntentParams(client, intentParams)
          intentHash = generateIntentHash()
          const ix = await solverSdk.createIntentIx(intentHash, params, true)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1, program)

          const now = Number(client.getClock().unixTimestamp)
          proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]
          fees = [
            {
              mint: mint.publicKey,
              amount: DEFAULT_MAX_FEE_HALF,
            },
          ]
        })

        it('creates proposal with correct fees', async () => {
          const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
          await makeTxSignAndSend(solverProvider, proposalIx)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.fees.length).to.be.eq(1)
          expect(proposal.fees[0].mint.toString()).to.be.eq(mint.publicKey.toString())
          expect(proposal.fees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE_HALF)
        })
      })
    })

    context('when caller is not whitelisted solver', () => {
      let intentHash: string
      let instructions: ProposalInstruction[]
      let fees: TokenFee[]
      let deadline: number

      beforeEach('create intent and proposal params', async () => {
        intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const now = Number(client.getClock().unixTimestamp)
        deadline = now + PROPOSAL_DEADLINE_OFFSET

        instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')
      })
    })

    context('when deadline is invalid', () => {
      context('when deadline is in the past', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]
        let deadline: number

        beforeEach('create intent and proposal params with past deadline', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now - SHORT_DEADLINE

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, 'Deadline must be in the future')
        })
      })

      context('when deadline equals now', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]
        let deadline: number

        beforeEach('create intent and proposal params with deadline equal to now', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, 'Deadline must be in the future')
        })
      })

      context('when intent deadline has passed', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let proposalDeadline: number

        beforeEach('create intent with short deadline and expire it', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const intentDeadline = now + SHORT_DEADLINE
          const intentParams: Partial<CreateIntentParams> = {
            deadline: intentDeadline,
          }
          const params = createIntentParams(client, intentParams)
          intentHash = generateIntentHash()
          const ix = await solverSdk.createIntentIx(intentHash, params)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1, program)

          warpSeconds(provider, 101)

          proposalDeadline = now + 200
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, `Intent has already expired`)
        })
      })

      context('when proposal deadline exceeds intent deadline', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let proposalDeadline: number

        beforeEach('create intent and proposal params with deadline exceeding intent', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intentDeadline = Number((await program.account.intent.fetch(sdk.getIntentKey(intentHash))).deadline)
          proposalDeadline = intentDeadline + SHORT_DEADLINE

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, `Proposal deadline can't be after the Intent's deadline`)
        })
      })
    })

    context('when intent conditions are not met', () => {
      context('when intent has insufficient validations', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let proposalDeadline: number

        beforeEach('create intent with insufficient validations', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const intentParams: Partial<CreateIntentParams> = {
            deadline: now + INTENT_DEADLINE_OFFSET,
            minValidations: 2,
          }
          const params = createIntentParams(client, intentParams)
          intentHash = generateIntentHash()
          const ix = await solverSdk.createIntentIx(intentHash, params)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators to 1 (less than min_validations of 2)
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1, program)

          proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, `Intent has insufficient validations`)
        })
      })

      context('when intent is not final', () => {
        let intentHash: string
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]
        let deadline: number

        beforeEach('create non-final intent and proposal params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: false })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, `Intent is not final`)
        })
      })
    })

    context('when intent already exists', () => {
      context('when fulfilled_intent PDA already exists', () => {
        let intentHash: string
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent, mock fulfilled intent, and proposal params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          // Mock FulfilledIntent
          const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
          client.setAccount(fulfilledIntent, {
            executable: false,
            lamports: 1002240,
            owner: program.programId,
            data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
          })

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix)

          expectTransactionError(
            res,
            `AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned. Error Number: 3011. Error Message: The given account is not owned by the system program`
          )
        })
      })

      context('when proposal with same intent_hash and solver already exists', () => {
        let intentHash: string
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent, proposal params, and create first proposal', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          deadline = now + PROPOSAL_DEADLINE_OFFSET

          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))

          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          await makeTxSignAndSend(solverProvider, ix)
          client.expireBlockhash()
        })

        it('throws an error', async () => {
          const ix2 = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
          const res = await makeTxSignAndSend(solverProvider, ix2)

          expectTransactionError(res, `already in use`)
        })
      })
    })

    context('when intent does not exist', () => {
      let intentHash: string
      let deadline: number
      let instructions: ProposalInstruction[]

      beforeEach('generate non-existent intent hash and proposal params', () => {
        intentHash = generateIntentHash()
        const now = Number(client.getClock().unixTimestamp)
        deadline = now + PROPOSAL_DEADLINE_OFFSET

        instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]
      })

      it('throws an error', async () => {
        const ix = await solverSdk.createProposalIx(intentHash, instructions, [], deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when fees are invalid', () => {
      context('when fees exceed max_fees', () => {
        let intentHash: string
        let mint: Keypair
        let proposalDeadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent with max_fees and proposal params with exceeding fees', async () => {
          intentHash = generateIntentHash()
          mint = Keypair.generate()
          const now = Number(client.getClock().unixTimestamp)
          const intentParams: Partial<CreateIntentParams> = {
            maxFees: [
              {
                mint: mint.publicKey,
                amount: DEFAULT_MAX_FEE,
              },
            ],
            eventsHex: [],
          }
          const params = createIntentParams(client, intentParams)
          const ix = await solverSdk.createIntentIx(intentHash, params, true)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1, program)

          proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = [
            {
              mint: mint.publicKey,
              amount: DEFAULT_MAX_FEE_EXCEED, // Exceeds max_fee
            },
          ]
        })

        it('throws an error', async () => {
          const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
          const res = await makeTxSignAndSend(solverProvider, proposalIx)

          expect(res).to.be.instanceOf(FailedTransactionMetadata)
          expect(res.toString()).to.match(/FeeAmountExceedsMaxFee|Fee amount exceeds max fee/i)
        })
      })

      context('when fees have wrong mint', () => {
        let intentHash: string
        let mint: Keypair
        let wrongMint: Keypair
        let proposalDeadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent with max_fees and proposal params with wrong mint', async () => {
          intentHash = generateIntentHash()
          mint = Keypair.generate()
          wrongMint = Keypair.generate()
          const now = Number(client.getClock().unixTimestamp)
          const intentParams: Partial<CreateIntentParams> = {
            maxFees: [
              {
                mint: mint.publicKey,
                amount: DEFAULT_MAX_FEE,
              },
            ],
            eventsHex: [],
          }
          const params = createIntentParams(client, intentParams)
          const ix = await solverSdk.createIntentIx(intentHash, params, true)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1, program)

          proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
          instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: TEST_DATA_HEX_3,
            },
          ]

          fees = [
            {
              mint: wrongMint.publicKey, // Wrong mint
              amount: DEFAULT_MAX_FEE_HALF,
            },
          ]
        })

        it('throws an error', async () => {
          const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
          const res = await makeTxSignAndSend(solverProvider, proposalIx)

          expect(res).to.be.instanceOf(FailedTransactionMetadata)
          expect(res.toString()).to.match(/InvalidFeeMint|Invalid fee mint/i)
        })
      })
    })
  })

  describe('add_instructions_to_proposal', () => {
    const createTestProposal = async (isFinal = false): Promise<string> => {
      const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
      const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
      const now = Number(client.getClock().unixTimestamp)
      const deadline = now + PROPOSAL_DEADLINE_OFFSET

      const instructions = [
        {
          programId: Keypair.generate().publicKey,
          accounts: [
            {
              pubkey: Keypair.generate().publicKey,
              isSigner: false,
              isWritable: true,
            },
          ],
          data: DEFAULT_DATA_HEX,
        },
      ]

      const fees = intent.maxFees.map((maxFee) => ({
        mint: maxFee.mint,
        amount: maxFee.amount.toNumber(),
      }))

      const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, isFinal)
      await makeTxSignAndSend(solverProvider, ix)
      return intentHash
    }

    context('when adding valid instructions', () => {
      context('when adding a single instruction', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [
                {
                  pubkey: Keypair.generate().publicKey,
                  isSigner: false,
                  isWritable: true,
                },
              ],
              data: '040506',
            },
          ]
        })

        it('adds the instruction to the proposal', async () => {
          const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
          await makeTxSignAndSend(solverProvider, ix)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.instructions.length).to.be.eq(2)
          expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq('010203')
          expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('040506')
          expect(proposal.isFinal).to.be.false
          expect(proposal.instructions[1].accounts.length).to.be.eq(1)
          expect(proposal.instructions[1].accounts[0].pubkey.toString()).to.be.eq(
            moreInstructions[0].accounts[0].pubkey.toString()
          )
          expect(proposal.instructions[1].accounts[0].isSigner).to.be.eq(false)
          expect(proposal.instructions[1].accounts[0].isWritable).to.be.eq(true)
        })
      })

      context('when adding multiple instructions', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '070809',
            },
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '0a0b0c',
            },
          ]
        })

        it('adds multiple instructions to the proposal', async () => {
          const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
          await makeTxSignAndSend(solverProvider, ix)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.instructions.length).to.be.eq(3)
          expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('070809')
          expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq('0a0b0c')
          expect(proposal.isFinal).to.be.false
        })
      })

      context('when adding instructions multiple times', () => {
        let intentHash: string
        let moreInstructions1: ProposalInstruction[]
        let moreInstructions2: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions1 = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '0d0e0f',
            },
          ]

          moreInstructions2 = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '101112',
            },
          ]
        })

        it('adds instructions to the proposal multiple times', async () => {
          const ix1 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions1, false)
          await makeTxSignAndSend(solverProvider, ix1)

          const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions2, false)
          await makeTxSignAndSend(solverProvider, ix2)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.instructions.length).to.be.eq(3)
          expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('0d0e0f')
          expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq('101112')
          expect(proposal.isFinal).to.be.false
        })
      })

      context('when finalizing with finalize=true', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '212223',
            },
          ]
        })

        it('finalizes the proposal', async () => {
          const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, true)
          await makeTxSignAndSend(solverProvider, ix)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.isFinal).to.be.true
          expect(proposal.instructions.length).to.be.eq(2)
        })
      })

      context('when not finalizing with finalize=false', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '242526',
            },
          ]
        })

        it('does not finalize the proposal', async () => {
          const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
          await makeTxSignAndSend(solverProvider, ix)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.isFinal).to.be.false
          expect(proposal.instructions.length).to.be.eq(2)
        })
      })

      context('when finalizing by default', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal and instruction params', async () => {
          intentHash = await createTestProposal(false)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '272829',
            },
          ]
        })

        it('finalizes the proposal by default', async () => {
          const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
          await makeTxSignAndSend(solverProvider, ix)

          const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposal.isFinal).to.be.true
          expect(proposal.instructions.length).to.be.eq(2)
        })
      })
    })

    context('when caller is not proposal creator', () => {
      let intentHash: string
      let proposalCreator: PublicKey
      let moreInstructions: ProposalInstruction[]

      beforeEach('create proposal and instruction params', async () => {
        intentHash = await createTestProposal(false)
        proposalCreator = (await program.account.proposal.fetch(solverSdk.getProposalKey(intentHash))).creator

        moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '131415',
          },
        ]
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.addInstructionsToProposalIx(
          intentHash,
          moreInstructions,
          undefined,
          proposalCreator
        )
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be proposal creator`)
      })
    })

    context('when proposal does not exist', () => {
      let intentHash: string
      let moreInstructions: ProposalInstruction[]

      beforeEach('generate non-existent intent hash and instruction params', () => {
        intentHash = generateIntentHash()

        moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '161718',
          },
        ]
      })

      it('throws an error', async () => {
        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when proposal has expired', () => {
      context('when proposal deadline has passed', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal with short deadline, warp time, and instruction params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + STALE_CLAIM_DELAY

          const instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '010203',
            },
          ]

          const fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))

          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
          await makeTxSignAndSend(solverProvider, ix)

          warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '19202a',
            },
          ]
        })

        it('throws an error', async () => {
          const addIx = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
          const res = await makeTxSignAndSend(solverProvider, addIx)

          expectTransactionError(res, 'Proposal has already expired')
        })
      })

      context('when proposal deadline equals now', () => {
        let intentHash: string
        let moreInstructions: ProposalInstruction[]

        beforeEach('create proposal with short deadline, warp time, and instruction params', async () => {
          intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + SHORT_DEADLINE

          const instructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '010203',
            },
          ]

          const fees = intent.maxFees.map((maxFee: any) => ({
            mint: maxFee.mint,
            amount: maxFee.amount.toNumber(),
          }))

          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
          await makeTxSignAndSend(solverProvider, ix)

          warpSeconds(provider, WARP_TIME_SHORT)

          moreInstructions = [
            {
              programId: Keypair.generate().publicKey,
              accounts: [],
              data: '1b1c1d',
            },
          ]
        })

        it('throws an error', async () => {
          const addIx = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
          const res = await makeTxSignAndSend(solverProvider, addIx)

          expectTransactionError(res, 'Proposal has already expired')
        })
      })
    })

    context('when proposal is already final', () => {
      let intentHash: string
      let moreInstructions: ProposalInstruction[]

      beforeEach('create finalized proposal and instruction params', async () => {
        intentHash = await createTestProposal(true)

        moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '1e1f20',
          },
        ]
      })

      it('throws an error', async () => {
        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Proposal is already final`)
      })
    })
  })

  describe('claim_stale_proposal', () => {
    const createTestProposalWithDeadline = async (deadline: number): Promise<string> => {
      const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
      const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))

      const instructions = [
        {
          programId: Keypair.generate().publicKey,
          accounts: [
            {
              pubkey: Keypair.generate().publicKey,
              isSigner: false,
              isWritable: true,
            },
          ],
          data: DEFAULT_DATA_HEX,
        },
      ]

      const fees = intent.maxFees.map((maxFee) => ({
        mint: maxFee.mint,
        amount: maxFee.amount.toNumber(),
      }))

      const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
      await makeTxSignAndSend(solverProvider, ix)
      return intentHash
    }

    context('when proposal is stale', () => {
      let intentHash: string
      let proposalBefore: any
      let proposalBalanceBefore: number
      let proposalCreatorBalanceBefore: number

      beforeEach('create proposal with short deadline, warp time, and get balances', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        intentHash = await createTestProposalWithDeadline(deadline)

        proposalBefore = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposalBefore).to.not.be.null

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        proposalBalanceBefore =
          Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0
        proposalCreatorBalanceBefore = Number(provider.client.getBalance(proposalBefore.creator)) || 0
      })

      it('claims the stale proposal', async () => {
        const ix = await solverSdk.claimStaleProposalIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)

        const proposalBalanceAfter =
          Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0
        const proposalCreatorBalanceAfter = Number(provider.client.getBalance(proposalBefore.creator)) || 0

        try {
          await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect.fail('Proposal account should be closed')
        } catch (error: any) {
          expect(error.message).to.include(`Account does not exist`)
        }

        expect(proposalCreatorBalanceAfter).to.be.eq(
          proposalCreatorBalanceBefore + proposalBalanceBefore - ACCOUNT_CLOSE_FEE
        )
        expect(proposalBalanceAfter).to.be.eq(0)
      })
    })

    context('when deadline has not passed', () => {
      context('when deadline has not passed', () => {
        let intentHash: string

        beforeEach('create proposal and warp time', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + LONG_DEADLINE
          intentHash = await createTestProposalWithDeadline(deadline)

          warpSeconds(provider, WARP_TIME_SHORT)
        })

        it('throws an error', async () => {
          const ix = await solverSdk.claimStaleProposalIx(intentHash)
          const res = await makeTxSignAndSend(solverProvider, ix)

          expectTransactionError(res, `Proposal not yet expired`)
        })
      })

      context('when deadline equals now', () => {
        let intentHash: string

        beforeEach('create proposal and warp time', async () => {
          const now = Number(client.getClock().unixTimestamp)
          const deadline = now + MEDIUM_DEADLINE
          intentHash = await createTestProposalWithDeadline(deadline)

          warpSeconds(provider, MEDIUM_DEADLINE)
        })

        it('throws an error', async () => {
          const ix = await solverSdk.claimStaleProposalIx(intentHash)
          const res = await makeTxSignAndSend(solverProvider, ix)

          expectTransactionError(res, `Proposal not yet expired`)
        })
      })
    })

    context('when caller is not proposal creator', () => {
      let intentHash: string

      beforeEach('create proposal and warp time', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + EXPIRATION_TEST_DELAY
        intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, EXPIRATION_TEST_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.claimStaleProposalIx(intentHash, solver.publicKey)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be proposal creator`)
      })
    })

    context('when proposal does not exist', () => {
      let intentHash: string

      beforeEach('generate non-existent intent hash', () => {
        intentHash = generateIntentHash()
      })

      it('throws an error', async () => {
        const ix = await solverSdk.claimStaleProposalIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when claiming twice', () => {
      let intentHash: string

      beforeEach('create proposal, warp time, and claim once', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + DOUBLE_CLAIM_DELAY
        intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, DOUBLE_CLAIM_DELAY_PLUS_ONE)

        const ix = await solverSdk.claimStaleProposalIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
      })

      it('throws an error', async () => {
        const ix2 = await solverSdk.claimStaleProposalIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        const errorMsg = res.toString()
        expect(errorMsg.includes(`AccountNotInitialized`)).to.be.true
      })
    })
  })

  describe('add_validator_sigs', () => {
    let whitelistedValidator: Keypair

    before(async () => {
      whitelistedValidator = Keypair.generate()
      const whitelistValidatorIx = await controllerSdk.setAllowedEntityIx(
        EntityType.Validator,
        whitelistedValidator.publicKey
      )
      await makeTxSignAndSend(provider, whitelistValidatorIx)
    })

    context('when adding valid signatures', () => {
      it('should add validator signature successfully', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const intentBefore = await program.account.intent.fetch(intentKey)
        expect(intentBefore.validators.length).to.be.eq(0)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        await makeTxSignAndSend(solverProvider, ...ixs)

        const intentAfter = await program.account.intent.fetch(intentKey)
        expect(intentAfter.validators.length).to.be.eq(1)
        expect(intentAfter.validators[0].toString()).to.be.eq(whitelistedValidator.publicKey.toString())
      })

      it('should add multiple validator signatures', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          minValidations: MULTIPLE_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const validator1 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)
        const validator2 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)
        const validator3 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)

        const signature1 = await createValidatorSignature(intentHash, validator1)
        const ixs1 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator1.publicKey,
          signature1
        )
        await makeTxSignAndSend(solverProvider, ...ixs1)

        const intentAfter1 = await program.account.intent.fetch(intentKey)
        expect(intentAfter1.validators.length).to.be.eq(1)

        const signature2 = await createValidatorSignature(intentHash, validator2)
        const ixs2 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator2.publicKey,
          signature2
        )
        await makeTxSignAndSend(solverProvider, ...ixs2)

        const intentAfter2 = await program.account.intent.fetch(intentKey)
        expect(intentAfter2.validators.length).to.be.eq(2)

        const signature3 = await createValidatorSignature(intentHash, validator3)
        const ixs3 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator3.publicKey,
          signature3
        )
        await makeTxSignAndSend(solverProvider, ...ixs3)

        const intentAfter3 = await program.account.intent.fetch(intentKey)
        expect(intentAfter3.validators.length).to.be.eq(3)
        expect(intentAfter3.validators.map((v) => v.toString())).to.include(validator1.publicKey.toString())
        expect(intentAfter3.validators.map((v) => v.toString())).to.include(validator2.publicKey.toString())
        expect(intentAfter3.validators.map((v) => v.toString())).to.include(validator3.publicKey.toString())
      })

      it('should handle duplicate validator signature gracefully', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { minValidations: 2, isFinal: true })
        const intentKey = sdk.getIntentKey(intentHash)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ixs1 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        await makeTxSignAndSend(solverProvider, ...ixs1)

        const intentAfter1 = await program.account.intent.fetch(intentKey)
        expect(intentAfter1.validators.length).to.be.eq(1)

        client.expireBlockhash()
        const ixs2 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        await makeTxSignAndSend(solverProvider, ...ixs2)

        const intentAfter2 = await program.account.intent.fetch(intentKey)
        expect(intentAfter2.validators.length).to.be.eq(1)
      })

      it('should handle when min_validations already met', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const validator1 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)
        const validator2 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)

        const signature1 = await createValidatorSignature(intentHash, validator1)
        const ixs1 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator1.publicKey,
          signature1
        )
        await makeTxSignAndSend(solverProvider, ...ixs1)

        const intentAfter1 = await program.account.intent.fetch(intentKey)
        expect(intentAfter1.validators.length).to.be.eq(1)
        expect(intentAfter1.minValidations).to.be.eq(1)

        client.expireBlockhash()
        const signature2 = await createValidatorSignature(intentHash, validator2)
        const ixs2 = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator2.publicKey,
          signature2
        )
        await makeTxSignAndSend(solverProvider, ...ixs2)

        const intentAfter2 = await program.account.intent.fetch(intentKey)
        expect(intentAfter2.validators.length).to.be.eq(1)
        expect(intentAfter2.validators[0].toString()).to.be.eq(validator1.publicKey.toString())
      })
    })

    context('when intent conditions are not met', () => {
      it('cannot add signature if intent is not final', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: false,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `Intent is not final`)
      })

      it('cannot add signature if intent has expired', async () => {
        const intentHash = generateIntentHash()
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + SHORT_DEADLINE
        const intentParams: Partial<CreateIntentParams> = {
          deadline,
        }
        const params = createIntentParams(client, intentParams)
        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intentKey = sdk.getIntentKey(intentHash)

        warpSeconds(provider, 101)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `Intent has already expired`)
      })
    })

    context('when validator is not whitelisted', () => {
      it('cannot add signature if validator is not whitelisted', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const validator = Keypair.generate()

        const signature = await createValidatorSignature(intentHash, validator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(
          res,
          `AnchorError caused by account: validator_registry. Error Code: AccountNotInitialized.`
        )
      })
    })

    context('when solver is not whitelisted', () => {
      it('cannot add signature if solver is not whitelisted', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ixs = await maliciousSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(maliciousProvider, ...ixs)

        expectTransactionError(
          res,
          `AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized.`
        )
      })
    })

    context('when intent does not exist', () => {
      it('cannot add signature for non-existent intent', async () => {
        const intentHash = generateIntentHash()
        const intentKey = sdk.getIntentKey(intentHash)

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          message: Buffer.from(intentHash, 'hex'),
          publicKey: whitelistedValidator.publicKey.toBuffer(),
          signature: Buffer.from(signature),
        })

        const ix = await program.methods
          .addValidatorSig()
          .accountsPartial({
            solver: solverSdk.getSignerKey(),
            solverRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Solver, solverSdk.getSignerKey()),
            intent: intentKey,
            fulfilledIntent: solverSdk.getFulfilledIntentKey(intentHash),
            validatorRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Validator, whitelistedValidator.publicKey),
            ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()

        const res = await makeTxSignAndSend(solverProvider, ed25519Ix, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })
    })

    context('when signature is invalid', () => {
      it('cannot add signature if fulfilled_intent PDA already exists', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
        client.setAccount(fulfilledIntent, {
          executable: false,
          lamports: 1002240,
          owner: program.programId,
          data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
        })

        const signature = await createValidatorSignature(intentHash, whitelistedValidator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(
          res,
          `AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned. Error Number: 3011. Error Message: The given account is not owned by the system program`
        )
      })

      it('cannot add signature with wrong intent hash', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const wrongIntentHash = generateIntentHash()
        const signature = await createValidatorSignature(wrongIntentHash, whitelistedValidator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(wrongIntentHash, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `Signature verification failed`)
      })

      it('cannot add signature with invalid signature', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey = sdk.getIntentKey(intentHash)

        const invalidSignature: number[] = Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          whitelistedValidator.publicKey,
          invalidSignature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expect(res.toString()).to.be.eq(
          `FailedTransactionMetadata(FailedTransactionMetadata { err: InstructionError(0, Custom(2)), meta: TransactionMetadata { signature: 1111111111111111111111111111111111111111111111111111111111111111, logs: [], inner_instructions: [], compute_units_consumed: 0, return_data: TransactionReturnData { program_id: 11111111111111111111111111111111, data: [] } } })`
        )
      })

      it('cannot add valid signature but for another intent', async () => {
        const intentHash1 = await createTestIntent(solverSdk, solverProvider, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })
        const intentKey1 = sdk.getIntentKey(intentHash1)

        const intentHash2 = await createTestIntent(solverSdk, solverProvider, {
          minValidations: DEFAULT_MIN_VALIDATIONS,
          isFinal: true,
        })

        const signature = await createValidatorSignature(intentHash2, whitelistedValidator)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey1,
          Buffer.from(intentHash2, 'hex'),
          whitelistedValidator.publicKey,
          signature
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `Signature verification failed`)
      })
    })
  })

  describe('add_axia_sig', () => {
    let whitelistedAxia: Keypair

    before(async () => {
      whitelistedAxia = Keypair.generate()
      const whitelistAxiaIx = await controllerSdk.setAllowedEntityIx(EntityType.Axia, whitelistedAxia.publicKey)
      await makeTxSignAndSend(provider, whitelistAxiaIx)
    })

    context('when adding valid signatures', () => {
      it('should add axia signature successfully', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const proposalBefore = await program.account.proposal.fetch(proposalKey)
        expect(proposalBefore.isSigned).to.be.false

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs)

        const proposalAfter = await program.account.proposal.fetch(proposalKey)
        expect(proposalAfter.isSigned).to.be.true
      })

      it('should handle duplicate signature gracefully', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs1 = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs1)

        const proposalAfter1 = await program.account.proposal.fetch(proposalKey)
        expect(proposalAfter1.isSigned).to.be.true

        client.expireBlockhash()
        const ixs2 = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs2)

        const proposalAfter2 = await program.account.proposal.fetch(proposalKey)
        expect(proposalAfter2.isSigned).to.be.true
      })

      it('should add signature multiple times safely', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs1 = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs1)

        client.expireBlockhash()
        const ixs2 = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs2)

        client.expireBlockhash()
        const ixs3 = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs3)

        const proposalAfter = await program.account.proposal.fetch(proposalKey)
        expect(proposalAfter.isSigned).to.be.true
      })

      it('should add signature when proposal deadline is close', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + VERY_SHORT_DEADLINE
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program, { deadline })

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        await makeTxSignAndSend(solverProvider, ...ixs)

        const proposalAfter = await program.account.proposal.fetch(proposalKey)
        expect(proposalAfter.isSigned).to.be.true
      })
    })

    context('when proposal conditions are not met', () => {
      it('cannot add signature if proposal is not final', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + PROPOSAL_DEADLINE_OFFSET

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)

        const proposalKey = sdk.getProposalKey(intentHash, solver.publicKey)
        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, 'Proposal is not final')
      })

      it('cannot add signature if proposal has expired', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program, { deadline })

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, 'Proposal has already expired')
      })

      it('cannot add signature if proposal deadline equals now', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + SHORT_DEADLINE
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program, { deadline })

        warpSeconds(provider, WARP_TIME_SHORT)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, 'Proposal has already expired')
      })
    })

    context('when axia is not whitelisted', () => {
      it('cannot add signature if axia is not whitelisted', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const axia = Keypair.generate()
        const signature = await createAxiaSignature(proposalKey, axia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, axia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `AnchorError caused by account: axia_registry. Error Code: AccountNotInitialized.`)
      })
    })

    context('when solver is not whitelisted', () => {
      it('cannot add signature if solver is not whitelisted', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ixs = await maliciousSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(maliciousProvider, ...ixs)

        expectTransactionError(
          res,
          `AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized.`
        )
      })
    })

    context('when proposal does not exist', () => {
      it('cannot add signature for non-existent proposal', async () => {
        const proposalKey = Keypair.generate().publicKey

        const signature = await createAxiaSignature(proposalKey, whitelistedAxia)

        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          message: proposalKey.toBuffer(),
          publicKey: whitelistedAxia.publicKey.toBuffer(),
          signature: Buffer.from(signature),
        })

        const ix = await program.methods
          .addAxiaSig()
          .accountsPartial({
            solver: solverSdk.getSignerKey(),
            solverRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Solver, solverSdk.getSignerKey()),
            proposal: proposalKey,
            axiaRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Axia, whitelistedAxia.publicKey),
            ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()

        const res = await makeTxSignAndSend(solverProvider, ed25519Ix, ix)

        expectTransactionError(
          res,
          `Program log: AnchorError caused by account: proposal. Error Code: AccountNotInitialized`
        )
      })
    })

    context('when signature is invalid', () => {
      it('cannot add signature with wrong proposal key', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)
        const wrongProposalKey = Keypair.generate().publicKey

        const signature = await createAxiaSignature(wrongProposalKey, whitelistedAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expect(res.toString()).to.be.eq(
          `FailedTransactionMetadata(FailedTransactionMetadata { err: InstructionError(0, Custom(2)), meta: TransactionMetadata { signature: 1111111111111111111111111111111111111111111111111111111111111111, logs: [], inner_instructions: [], compute_units_consumed: 0, return_data: TransactionReturnData { program_id: 11111111111111111111111111111111, data: [] } } })`
        )
      })

      it('cannot add signature with invalid signature', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const invalidSignature: number[] = Array.from({ length: 64 }, () => Math.floor(Math.random() * 256))

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, invalidSignature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expect(res.toString()).to.be.eq(
          `FailedTransactionMetadata(FailedTransactionMetadata { err: InstructionError(0, Custom(2)), meta: TransactionMetadata { signature: 1111111111111111111111111111111111111111111111111111111111111111, logs: [], inner_instructions: [], compute_units_consumed: 0, return_data: TransactionReturnData { program_id: 11111111111111111111111111111111, data: [] } } })`
        )
      })

      it('cannot add signature from wrong axia pubkey', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const wrongAxia = Keypair.generate()
        const signature = await createAxiaSignature(proposalKey, wrongAxia)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, wrongAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `AnchorError caused by account: axia_registry. Error Code: AccountNotInitialized.`)
      })

      it('cannot add signature with signature from different axia', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const axia2 = await createAllowlistedEntity(controllerSdk, provider, EntityType.Axia)
        const signature = await createAxiaSignature(proposalKey, axia2)

        // Try to use axia2's signature but claim it's from whitelistedAxia
        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, whitelistedAxia.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expect(res.toString()).to.be.eq(
          `FailedTransactionMetadata(FailedTransactionMetadata { err: InstructionError(0, Custom(2)), meta: TransactionMetadata { signature: 1111111111111111111111111111111111111111111111111111111111111111, logs: [], inner_instructions: [], compute_units_consumed: 0, return_data: TransactionReturnData { program_id: 11111111111111111111111111111111, data: [] } } })`
        )
      })

      it('cannot add signature with signature from validator instead of axia', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        const validator = await createAllowlistedEntity(controllerSdk, provider, EntityType.Validator)
        const signature = await createAxiaSignature(proposalKey, validator)

        const ixs = await solverSdk.addAxiaSigIxs(proposalKey, validator.publicKey, signature)
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        expectTransactionError(res, `AnchorError caused by account: axia_registry. Error Code: AccountNotInitialized.`)
      })

      it('cannot add signature if signed message is wrong', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        // Sign a different message (e.g., intent hash instead of proposal key)
        const intentHash = generateIntentHash()
        const signature = await signAsync(Buffer.from(intentHash, 'hex'), whitelistedAxia.secretKey.slice(0, 32))
        const signatureArray = Array.from(new Uint8Array(signature))

        const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
          message: Buffer.from(intentHash, 'hex'),
          publicKey: whitelistedAxia.publicKey.toBuffer(),
          signature: Buffer.from(signatureArray),
        })

        const ix = await program.methods
          .addAxiaSig()
          .accountsPartial({
            solver: solverSdk.getSignerKey(),
            solverRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Solver, solverSdk.getSignerKey()),
            proposal: proposalKey,
            axiaRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Axia, whitelistedAxia.publicKey),
            ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()

        const res = await makeTxSignAndSend(solverProvider, ed25519Ix, ix)

        expectTransactionError(res, `Signature verification failed`)
      })

      it('cannot add signature with corrupted ed25519 instruction', async () => {
        const { proposalKey } = await createFinalizedProposal(solverSdk, solverProvider, client, program)

        // Create corrupted Ed25519 instruction with wrong program ID
        const corruptedEd25519Ix = new TransactionInstruction({
          programId: Keypair.generate().publicKey,
          keys: [],
          data: Buffer.from([
            1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
          ]),
        })

        const ix = await program.methods
          .addAxiaSig()
          .accountsPartial({
            solver: solverSdk.getSignerKey(),
            solverRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Solver, solverSdk.getSignerKey()),
            proposal: proposalKey,
            axiaRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Axia, whitelistedAxia.publicKey),
            ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()

        const res = await makeTxSignAndSend(solverProvider, corruptedEd25519Ix, ix)

        expect(res.toString()).to.be.eq(
          // eslint-disable-next-line no-secrets/no-secrets
          `FailedTransactionMetadata(FailedTransactionMetadata { err: InvalidProgramForExecution, meta: TransactionMetadata { signature: 1111111111111111111111111111111111111111111111111111111111111111, logs: [], inner_instructions: [], compute_units_consumed: 0, return_data: TransactionReturnData { program_id: 11111111111111111111111111111111, data: [] } } })`
        )
      })
    })
  })
})
