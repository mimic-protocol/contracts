/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { BN } from 'bn.js'
import { expect } from 'chai'
import fs from 'fs'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import ControllerSDK, { EntityType } from '../sdks/controller/Controller'
import SettlerSDK from '../sdks/settler/Settler'
import { CreateIntentParams, ExtendIntentParams, OpType, ProposalInstruction, TokenFee } from '../sdks/settler/types'
import * as ControllerIDL from '../target/idl/controller.json'
import * as SettlerIDL from '../target/idl/settler.json'
import { Settler } from '../target/types/settler'
import {
  addValidatorsToIntent,
  CreateIntentOptions,
  createIntentParams,
  createProposalParams,
  createSignerInstructionAccount,
  createTestIntent,
  createTestProposalInstruction,
  createValidatedIntent,
  createWritableInstructionAccount,
  expectTransactionError,
  generateIntentHash,
  generateNonce,
  getCurrentTimestamp,
  mapIntentFeesToTokenFees,
  randomKeypair,
  randomPubkey,
  toLamports,
} from './helpers'
import {
  ACCOUNT_CLOSE_FEE,
  DEFAULT_DATA_HEX,
  DEFAULT_MAX_FEE,
  DEFAULT_MAX_FEE_EXCEED,
  DEFAULT_MAX_FEE_HALF,
  DOUBLE_CLAIM_DELAY,
  DOUBLE_CLAIM_DELAY_PLUS_ONE,
  EMPTY_DATA_HEX,
  EXPIRATION_TEST_DELAY,
  EXPIRATION_TEST_DELAY_PLUS_ONE,
  INTENT_DEADLINE_OFFSET,
  LONG_DEADLINE,
  MEDIUM_DEADLINE,
  PROPOSAL_DEADLINE_OFFSET,
  SHORT_DEADLINE,
  STALE_CLAIM_DELAY,
  STALE_CLAIM_DELAY_PLUS_ONE,
  TEST_DATA_HEX_1,
  TEST_DATA_HEX_2,
  TEST_DATA_HEX_3,
  WARP_TIME_LONG,
  WARP_TIME_SHORT,
} from './helpers/constants'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Settler', () => {
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
    malicious = randomKeypair()
    solver = randomKeypair()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins().withPrecompiles().withSysvars()

    provider = new LiteSVMProvider(client, new Wallet(admin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))
    solverProvider = new LiteSVMProvider(client, new Wallet(solver))

    program = new Program<Settler>(SettlerIDL as any, provider)

    sdk = new SettlerSDK(provider)
    maliciousSdk = new SettlerSDK(maliciousProvider)
    solverSdk = new SettlerSDK(solverProvider)

    provider.client.airdrop(admin.publicKey, toLamports(100))
    provider.client.airdrop(malicious.publicKey, toLamports(100))
    provider.client.airdrop(solver.publicKey, toLamports(100))

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
    let intentHash: string
    let intentOptions: CreateIntentOptions = {}

    const itThrowsAnError = (errorMessage: string) => {
      it('throws an error', async () => {
        const params = createIntentParams(client, intentOptions)
        const ix = await solverSdk.createIntentIx(intentHash, params, intentOptions.isFinal)
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, errorMessage)
      })
    }

    context('when caller is an allowlisted solver', () => {
      context('when intent data is valid', () => {
        context('when intent does not exist', () => {
          context('when creating a basic intent', () => {
            const intentOptions: CreateIntentOptions = {
              op: OpType.Transfer,
              user: randomPubkey(),
              nonceHex: generateNonce(),
              deadline: 10_000,
              minValidations: 5,
              dataHex: TEST_DATA_HEX_1,
              maxFees: [
                {
                  mint: randomPubkey(),
                  amount: 1000,
                },
              ],
              eventsHex: [
                {
                  topicHex: randomHex(32).slice(2),
                  dataHex: randomHex(100).slice(2),
                },
              ],
              isFinal: true,
            }

            it('creates the intent with correct properties', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))

              expect(intent.op).to.deep.include({ transfer: {} })
              expect(intent.user.toString()).to.be.eq(intentOptions.user!.toString())
              expect(intent.creator.toString()).to.be.eq(solver.publicKey.toString())
              expect('0x' + Buffer.from(intent.nonce).toString('hex')).to.be.eq(intentOptions.nonceHex)
              expect(intent.deadline.toNumber()).to.be.eq(intentOptions.deadline)
              expect(intent.minValidations).to.be.eq(intentOptions.minValidations)
              expect(intent.isFinal).to.be.true
              expect(Buffer.from(intent.data).toString('hex')).to.be.eq(intentOptions.dataHex)
              expect(intent.maxFees.length).to.be.eq(1)
              expect(intent.maxFees[0].amount.toNumber()).to.be.eq(1000)
              expect(intent.events.length).to.be.eq(1)
              expect(intent.validators.length).to.be.eq(0)
              expect(Buffer.from(intent.events[0].data).toString('hex')).to.be.eq(intentOptions.eventsHex![0].dataHex)
            })
          })

          context('when creating an intent with empty data', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              dataHex: EMPTY_DATA_HEX,
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              expect(intent.op).to.deep.include({ transfer: {} })
              expect(Buffer.from(intent.data).toString('hex')).to.be.eq(EMPTY_DATA_HEX)
              expect(intent.isFinal).to.be.true
            })
          })

          context('when creating an intent with empty events', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              eventsHex: [],
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              expect(intent.events.length).to.be.eq(0)
            })
          })

          context('when creating an intent with is_final true', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              isFinal: true,
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              expect(intent.isFinal).to.be.true
            })
          })

          context('when creating an intent with is_final false', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              isFinal: false,
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              expect(intent.isFinal).to.be.false
            })
          })
        })

        context('when intent already exists', () => {
          context('when fulfilled_intent PDA already exists', () => {
            beforeEach('create intent params and mock fulfilled intent', async () => {
              intentHash = generateIntentHash()

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
            beforeEach('create existing intent', async () => {
              intentOptions = {}
              intentHash = await createTestIntent(solverSdk, solverProvider)
              client.expireBlockhash()
            })

            itThrowsAnError('already in use')
          })
        })
      })

      context('when intent data is invalid', () => {
        context('when intent has empty max_fees', () => {
          beforeEach('create intent params with empty max_fees', async () => {
            intentHash = generateIntentHash()
            intentOptions = { maxFees: [] }
          })

          itThrowsAnError('No max fees provided')
        })

        context('when intent has hash shorter than 32 bytes', () => {
          let ix: TransactionInstruction

          before('create intent params and ix with invalid hash', async () => {
            intentHash = '123456' // invalid - not 32 bytes
            intentOptions = {}

            // Build ix with invalid hash
            const params = createIntentParams(client, intentOptions)
            const { op, user, nonceHex, deadline, minValidations, dataHex, maxFees, eventsHex } = params

            const intentHashParam = Array.from(Buffer.from(intentHash, 'hex'))
            const nonce = Array.from(Buffer.from(nonceHex, 'hex'))
            const data = Buffer.from(dataHex, 'hex')
            const maxFeesBn = maxFees.map((tokenFee) => ({
              ...tokenFee,
              amount: new BN(tokenFee.amount),
            }))
            const events = eventsHex.map((eventHex) => ({
              topic: Array.from(Uint8Array.from(Buffer.from(eventHex.topicHex, 'hex'))),
              data: Buffer.from(eventHex.dataHex, 'hex'),
            }))
            const intentKey = PublicKey.findProgramAddressSync(
              [Buffer.from('intent'), Buffer.from(intentHash, 'hex')],
              program.programId
            )[0]

            ix = await program.methods
              .createIntent(
                intentHashParam,
                data,
                maxFeesBn,
                events,
                minValidations,
                solverSdk.opTypeToAnchorEnum(op),
                user,
                nonce,
                new BN(deadline),
                false
              )
              .accountsPartial({
                intent: intentKey,
                solver: solverSdk.getSignerKey(),
                solverRegistry: solverSdk.getEntityRegistryPubkey(EntityType.Solver, solver.publicKey),
              })
              .instruction()
          })

          it('throws an error calling directly', async () => {
            const res = await makeTxSignAndSend(solverProvider, ix)
            expectTransactionError(res, 'AnchorError caused by account: intent. Error Code: ConstraintSeeds.')
          })
        })

        context('when deadline is invalid', () => {
          context('when deadline is in the past', () => {
            beforeEach('create intent params with past deadline', async () => {
              // Warp as time is likely still t=0
              warpSeconds(solverProvider, WARP_TIME_LONG)
              intentHash = generateIntentHash()
              intentOptions = { deadline: getCurrentTimestamp(client, -1 * SHORT_DEADLINE) }
            })

            itThrowsAnError('Deadline must be in the future')
          })

          context('when deadline equals now', () => {
            beforeEach('create intent params with deadline equal to now', async () => {
              intentHash = generateIntentHash()
              intentOptions = { deadline: getCurrentTimestamp(client) }
            })

            itThrowsAnError('Deadline must be in the future')
          })
        })
      })
    })

    context('when caller is not allowlisted solver', () => {
      beforeEach('create intent params', async () => {
        intentHash = generateIntentHash()
        intentOptions = {}
      })

      it('throws an error', async () => {
        const params = createIntentParams(client, intentOptions)
        const ix = await maliciousSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')

        const intent = client.getAccount(sdk.getIntentKey(intentHash))
        expect(intent).to.be.null
      })
    })
  })

  describe('extend_intent', () => {
    let intentHash: string
    let intentKey: PublicKey
    let extendParams: ExtendIntentParams = {}

    context('when caller is intent creator', () => {
      context('when intent exists', () => {
        context('when intent is not finalized', () => {
          context('when not finalizing intent', () => {
            context('when extending once', () => {
              context('when extending with more data', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                  extendParams = { moreDataHex: randomHex(6).slice(2) }
                })

                it('extends the intent with more data', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(Buffer.from(intent.data).toString('hex')).to.be.eq(
                    `${DEFAULT_DATA_HEX}${extendParams.moreDataHex}`
                  )
                  expect(intent.isFinal).to.be.false
                })
              })

              context('when extending with more max_fees', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                  extendParams = {
                    moreMaxFees: [
                      {
                        mint: randomPubkey(),
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
                  expect(intent.maxFees[1].mint.toString()).to.be.eq(extendParams.moreMaxFees![0].mint.toString())
                  expect(intent.maxFees[1].amount.toNumber()).to.be.eq(extendParams.moreMaxFees![0].amount)
                })
              })

              context('when extending with more events', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                  extendParams = {
                    moreEventsHex: [
                      {
                        topicHex: randomHex(32).slice(2),
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
                  expect(Buffer.from(intent.events[1].topic).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].topicHex
                  )
                  expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].dataHex
                  )
                })
              })

              context('when extending with all optional fields', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    dataHex: TEST_DATA_HEX_1,
                  })
                  extendParams = {
                    moreDataHex: TEST_DATA_HEX_2,
                    moreMaxFees: [
                      {
                        mint: randomPubkey(),
                        amount: 3000,
                      },
                    ],
                    moreEventsHex: [
                      {
                        topicHex: randomHex(32).slice(2),
                        dataHex: TEST_DATA_HEX_3,
                      },
                    ],
                  }
                })

                it('extends the intent with all optional fields', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(Buffer.from(intent.data).toString('hex')).to.be.eq(`${TEST_DATA_HEX_1}${TEST_DATA_HEX_2}`)
                  expect(intent.maxFees.length).to.be.eq(2)
                  expect(intent.maxFees[1].amount.toNumber()).to.be.eq(extendParams.moreMaxFees![0].amount)
                  expect(intent.events.length).to.be.eq(2)
                  expect(Buffer.from(intent.events[1].topic).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].topicHex
                  )
                  expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq(TEST_DATA_HEX_3)
                })
              })
            })

            context('when extending more than once', () => {
              context('when extending to large size', () => {
                const EXTEND_DATA_LOOPS = 100
                const EXTEND_EVENTS_LOOPS = 22
                const EXTEND_MAX_FEES_LOOPS = 18

                extendParams = {
                  moreDataHex: randomHex(50).slice(2),
                  moreEventsHex: [
                    { topicHex: randomHex(32).slice(2), dataHex: randomHex(400).slice(2) },
                    { topicHex: randomHex(32).slice(2), dataHex: randomHex(400).slice(2) },
                  ],
                  moreMaxFees: [
                    { mint: randomPubkey(), amount: 1 },
                    { mint: randomPubkey(), amount: 1 + 1000 },
                    { mint: randomPubkey(), amount: 1 + 2000 },
                  ],
                }

                before('create intent', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    dataHex: '',
                    eventsHex: [],
                  })
                  intentKey = sdk.getIntentKey(intentHash)
                })

                const itExtendsIntentWithoutFailing = async (
                  fieldName: string,
                  loops: number,
                  extendParams: ExtendIntentParams
                ) => {
                  it(`extends intent ${fieldName} without failing`, async () => {
                    for (let i = 0; i < loops; i++) {
                      const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                      const res = await makeTxSignAndSend(solverProvider, ix)
                      expect(res.toString()).to.include(`Program ${program.programId} success`)
                      client.expireBlockhash()
                    }
                  })
                }

                itExtendsIntentWithoutFailing('data', EXTEND_DATA_LOOPS, { moreDataHex: extendParams.moreDataHex })

                itExtendsIntentWithoutFailing('events', EXTEND_EVENTS_LOOPS, {
                  moreEventsHex: extendParams.moreEventsHex,
                })

                itExtendsIntentWithoutFailing('max fees', EXTEND_MAX_FEES_LOOPS, {
                  moreMaxFees: extendParams.moreMaxFees,
                })

                it('extended the intent fields as expected', async () => {
                  const intent = await program.account.intent.fetch(intentKey)
                  const intentAcc = client.getAccount(intentKey)
                  expect(intent.data.length).to.be.eq(5000)
                  expect(intent.maxFees.length).to.be.eq(55)
                  expect(intent.events.length).to.be.eq(44)
                  expect(intent.isFinal).to.be.false
                  expect(intentAcc?.data.length).to.be.eq(26581)
                })
              })

              context('when extending multiple times', () => {
                let extendParams1: ExtendIntentParams
                let extendParams2: ExtendIntentParams

                before('create intent', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    dataHex: TEST_DATA_HEX_1,
                  })
                  extendParams1 = { moreDataHex: randomHex(6).slice(2) }
                  extendParams2 = { moreDataHex: randomHex(6).slice(2) }
                })

                it('extends the intent once without failing', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams1, false)
                  await makeTxSignAndSend(solverProvider, ix)
                })

                it('extends the intent again without failing', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams2, false)
                  await makeTxSignAndSend(solverProvider, ix)
                })

                it('extended the intent as expected', async () => {
                  const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(Buffer.from(intent.data).toString('hex')).to.be.eq(
                    `${TEST_DATA_HEX_1}${extendParams1.moreDataHex}${extendParams2.moreDataHex}`
                  )
                  expect(intent.isFinal).to.be.false
                })
              })
            })
          })

          context('when finalizing intent', () => {
            context('when finalizing an intent', () => {
              beforeEach('create intent', async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                extendParams = {}
              })

              it('finalizes the intent', async () => {
                const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
                await makeTxSignAndSend(solverProvider, ix)

                const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
                expect(intent.isFinal).to.be.true
              })
            })

            context('when extending and finalizing in one call', () => {
              beforeEach('create intent and extend params', async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, {
                  isFinal: false,
                  dataHex: TEST_DATA_HEX_2,
                })
                extendParams = { moreDataHex: randomHex(6).slice(2) }
              })

              it('extends and finalizes the intent in one call', async () => {
                const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
                await makeTxSignAndSend(solverProvider, ix)

                const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
                expect(Buffer.from(intent.data).toString('hex')).to.be.eq(
                  `${TEST_DATA_HEX_2}${extendParams.moreDataHex}`
                )
                expect(intent.isFinal).to.be.true
              })
            })
          })
        })

        context('when intent is already finalized', () => {
          beforeEach('create finalized intent and extend params', async () => {
            intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
            extendParams = { moreDataHex: TEST_DATA_HEX_1 }
          })

          it('throws an error', async () => {
            const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
            const res = await makeTxSignAndSend(solverProvider, ix)

            expectTransactionError(res, `Intent is already final`)
          })
        })
      })

      context('when intent does not exist', () => {
        beforeEach('generate non-existent intent hash and extend params', () => {
          intentHash = generateIntentHash()
          extendParams = { moreDataHex: randomHex(6).slice(2) }
        })

        it('throws an error', async () => {
          const ix = await sdk.extendIntentIx(intentHash, extendParams, false)
          const res = await makeTxSignAndSend(provider, ix)

          expectTransactionError(res, `AccountNotInitialized`)
        })
      })
    })

    context('when caller is not intent creator', () => {
      beforeEach('create intent and extend params', async () => {
        intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        extendParams = { moreDataHex: randomHex(6).slice(2) }
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be intent creator`)
      })
    })
  })

  describe('claim_stale_intent', () => {
    let intentHash: string

    context('when caller is intent creator', () => {
      context('when intent exists', () => {
        context('when intent is stale', () => {
          context('when intent is final', () => {
            before('create final stale intent', async () => {
              const deadline = getCurrentTimestamp(client, STALE_CLAIM_DELAY)
              intentHash = await createTestIntent(solverSdk, solverProvider, { deadline, isFinal: true })

              warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)
            })

            it('claims the stale intent', async () => {
              const intentBefore = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              const intentBalanceBefore = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceBefore = Number(provider.client.getBalance(intentBefore.creator)) || 0

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

              expect(intentCreatorBalanceAfter).to.be.eq(
                intentCreatorBalanceBefore + intentBalanceBefore - ACCOUNT_CLOSE_FEE
              )
              expect(intentBalanceAfter).to.be.eq(0)
            })

            it('cannot claim the stale intent again', async () => {
              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              const res = await makeTxSignAndSend(solverProvider, ix)

              expectTransactionError(res, 'AccountNotInitialized')
            })
          })

          context('when intent is not final', () => {
            before('create not final stale intent', async () => {
              const deadline = getCurrentTimestamp(client, STALE_CLAIM_DELAY)
              intentHash = await createTestIntent(solverSdk, solverProvider, { deadline, isFinal: false })

              warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)
            })

            it('claims the stale intent', async () => {
              const intentBefore = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
              const intentBalanceBefore = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceBefore = Number(provider.client.getBalance(intentBefore.creator)) || 0

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

              expect(intentCreatorBalanceAfter).to.be.eq(
                intentCreatorBalanceBefore + intentBalanceBefore - ACCOUNT_CLOSE_FEE
              )
              expect(intentBalanceAfter).to.be.eq(0)
            })

            it('cannot claim the stale intent again', async () => {
              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              const res = await makeTxSignAndSend(solverProvider, ix)

              expectTransactionError(res, 'AccountNotInitialized')
            })
          })
        })

        context('when intent is not stale', () => {
          context('when deadline is in the past', () => {
            beforeEach('create intent and warp time', async () => {
              const deadline = getCurrentTimestamp(client, LONG_DEADLINE)
              intentHash = await createTestIntent(solverSdk, solverProvider, { deadline })
              warpSeconds(provider, WARP_TIME_SHORT)
            })

            it('throws an error', async () => {
              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              const res = await makeTxSignAndSend(solverProvider, ix)
              expectTransactionError(res, 'Intent not yet expired')
            })
          })

          context('when deadline equals now', () => {
            beforeEach('create intent and warp time', async () => {
              const deadline = getCurrentTimestamp(client, MEDIUM_DEADLINE)
              intentHash = await createTestIntent(solverSdk, solverProvider, { deadline })
              warpSeconds(provider, MEDIUM_DEADLINE)
            })

            it('throws an error', async () => {
              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              const res = await makeTxSignAndSend(solverProvider, ix)
              expectTransactionError(res, 'Intent not yet expired')
            })
          })
        })
      })

      context('when intent does not exist', () => {
        beforeEach('generate non-existent intent hash', () => {
          intentHash = generateIntentHash()
        })

        it('throws an error', async () => {
          const ix = await solverSdk.claimStaleIntentIx(intentHash)
          const res = await makeTxSignAndSend(solverProvider, ix)
          expectTransactionError(res, `AccountNotInitialized`)
        })
      })
    })

    context('when caller is not intent creator', () => {
      beforeEach('create intent and warp time', async () => {
        const deadline = getCurrentTimestamp(client, EXPIRATION_TEST_DELAY)
        intentHash = await createTestIntent(solverSdk, solverProvider, { deadline })
        warpSeconds(provider, EXPIRATION_TEST_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, `Signer must be intent creator`)
      })
    })
  })

  describe('create_proposal', () => {
    context('when creating a valid proposal', () => {
      context('when creating a basic proposal', () => {
        let intentHash: string
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('create intent and proposal params', async () => {
          const params = await createProposalParams(solverSdk, solverProvider, client, {
            intentOptions: { isFinal: true },
            instructions: [
              createTestProposalInstruction({
                accounts: [createWritableInstructionAccount()],
                data: 'deadbeef',
              }),
            ],
          })
          intentHash = params.intentHash
          deadline = params.deadline
          instructions = params.instructions
          fees = params.fees
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
          deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

          instructions = [
            createTestProposalInstruction({
              accounts: [createWritableInstructionAccount()],
              data: '010203',
            }),
            createTestProposalInstruction({
              accounts: [createSignerInstructionAccount()],
              data: '040506',
            }),
          ]

          fees = mapIntentFeesToTokenFees(intent)
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
          expect(proposal.instructions[1].accounts[0].isWritable).to.be.eq(true)
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
          deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

          instructions = []

          fees = mapIntentFeesToTokenFees(intent)
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
          mint = randomKeypair()
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
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

          proposalDeadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)
          instructions = [createTestProposalInstruction()]
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
        deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

        instructions = [createTestProposalInstruction()]

        fees = mapIntentFeesToTokenFees(intent)
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
          deadline = getCurrentTimestamp(client, -1 * SHORT_DEADLINE)

          instructions = [createTestProposalInstruction()]

          fees = mapIntentFeesToTokenFees(intent)
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
          deadline = getCurrentTimestamp(client)

          instructions = [createTestProposalInstruction()]

          fees = mapIntentFeesToTokenFees(intent)
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
          const intentDeadline = getCurrentTimestamp(client, SHORT_DEADLINE)
          const intentParams: Partial<CreateIntentParams> = {
            deadline: intentDeadline,
          }
          const params = createIntentParams(client, intentParams)
          intentHash = generateIntentHash()
          const ix = await solverSdk.createIntentIx(intentHash, params)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

          warpSeconds(provider, 101)

          proposalDeadline = getCurrentTimestamp(client, 200)
          instructions = [createTestProposalInstruction()]
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

          instructions = [createTestProposalInstruction()]
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
          const now = getCurrentTimestamp(client)
          const intentParams: Partial<CreateIntentParams> = {
            deadline: now + INTENT_DEADLINE_OFFSET,
            minValidations: 2,
          }
          const params = createIntentParams(client, intentParams)
          intentHash = generateIntentHash()
          const ix = await solverSdk.createIntentIx(intentHash, params)
          await makeTxSignAndSend(solverProvider, ix)

          // Add validators to 1 (less than min_validations of 2)
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

          proposalDeadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)
          instructions = [createTestProposalInstruction()]
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
          const params = await createProposalParams(solverSdk, solverProvider, client, {
            intentOptions: { isFinal: false },
          })
          intentHash = params.intentHash
          deadline = params.deadline
          instructions = params.instructions
          fees = params.fees
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
          deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

          // Mock FulfilledIntent
          const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
          client.setAccount(fulfilledIntent, {
            executable: false,
            lamports: 1002240,
            owner: program.programId,
            data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
          })

          const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          instructions = [createTestProposalInstruction()]

          fees = mapIntentFeesToTokenFees(intent)
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
          deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

          instructions = [createTestProposalInstruction()]

          fees = mapIntentFeesToTokenFees(intent)

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
        deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

        instructions = [createTestProposalInstruction()]
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
          mint = randomKeypair()
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
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

          proposalDeadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)
          instructions = [createTestProposalInstruction()]

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
          mint = randomKeypair()
          wrongMint = randomKeypair()
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
          await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

          proposalDeadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)
          instructions = [createTestProposalInstruction()]

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
      const deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)

      const instructions = [
        createTestProposalInstruction({
          accounts: [createWritableInstructionAccount()],
          data: DEFAULT_DATA_HEX,
        }),
      ]

      const fees = mapIntentFeesToTokenFees(intent)

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
            createTestProposalInstruction({
              accounts: [createWritableInstructionAccount()],
              data: '040506',
            }),
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
            createTestProposalInstruction({
              data: '070809',
            }),
            createTestProposalInstruction({
              data: '0a0b0c',
            }),
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
            createTestProposalInstruction({
              data: '0d0e0f',
            }),
          ]

          moreInstructions2 = [
            createTestProposalInstruction({
              data: '101112',
            }),
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
            createTestProposalInstruction({
              data: '212223',
            }),
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
            createTestProposalInstruction({
              data: '242526',
            }),
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
            createTestProposalInstruction({
              data: '272829',
            }),
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
          createTestProposalInstruction({
            data: '131415',
          }),
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
          createTestProposalInstruction({
            data: '161718',
          }),
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
          const deadline = getCurrentTimestamp(client, STALE_CLAIM_DELAY)

          const instructions = [
            createTestProposalInstruction({
              data: '010203',
            }),
          ]

          const fees = mapIntentFeesToTokenFees(intent)

          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
          await makeTxSignAndSend(solverProvider, ix)

          warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

          moreInstructions = [
            createTestProposalInstruction({
              data: '19202a',
            }),
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
          const deadline = getCurrentTimestamp(client, SHORT_DEADLINE)

          const instructions = [
            createTestProposalInstruction({
              data: '010203',
            }),
          ]

          const fees = mapIntentFeesToTokenFees(intent)

          const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
          await makeTxSignAndSend(solverProvider, ix)

          warpSeconds(provider, WARP_TIME_SHORT)

          moreInstructions = [
            createTestProposalInstruction({
              data: '1b1c1d',
            }),
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
          createTestProposalInstruction({
            data: '1e1f20',
          }),
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
        createTestProposalInstruction({
          accounts: [createWritableInstructionAccount()],
          data: DEFAULT_DATA_HEX,
        }),
      ]

      const fees = mapIntentFeesToTokenFees(intent)

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
        const deadline = getCurrentTimestamp(client, STALE_CLAIM_DELAY)
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
          const deadline = getCurrentTimestamp(client, LONG_DEADLINE)
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
          const deadline = getCurrentTimestamp(client, MEDIUM_DEADLINE)
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
        const deadline = getCurrentTimestamp(client, EXPIRATION_TEST_DELAY)
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
        const deadline = getCurrentTimestamp(client, DOUBLE_CLAIM_DELAY)
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
})
