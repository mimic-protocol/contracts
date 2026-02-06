/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { BN } from 'bn.js'
import { expect } from 'chai'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import ControllerSDK, { EntityType } from '../sdks/controller/Controller'
import SettlerSDK from '../sdks/settler/Settler'
import { CreateProposalParams, ExtendIntentParams, OpType, ProposalInstruction, TokenFee } from '../sdks/settler/types'
import * as ControllerIDL from '../target/idl/controller.json'
import * as SettlerIDL from '../target/idl/settler.json'
import { Settler } from '../target/types/settler'
import {
  addValidatorsToIntent,
  CreateIntentOptions,
  createIntentParams,
  CreateProposalOptions,
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
  randomKeypair,
  randomPubkey,
  toLamports,
} from './helpers'
import {
  ACCOUNT_CLOSE_FEE,
  DEFAULT_DATA_HEX,
  DEFAULT_MAX_FEE,
  EMPTY_DATA_HEX,
  EXPIRATION_TEST_DELAY,
  EXPIRATION_TEST_DELAY_PLUS_ONE,
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
          context('when deadline is in the future', () => {
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
    let params: CreateProposalParams & { intentHash: string }

    const createProposalFromParams = async () => {
      const ix = await solverSdk.createProposalIx(params.intentHash, params)
      return await makeTxSignAndSend(solverProvider, ix)
    }

    const itThrowsAnErrorWhenCreatingProposalFromParams = async (error: string) => {
      it('throws an error', async () => {
        const res = await createProposalFromParams()
        expectTransactionError(res, error)
      })
    }

    context('when caller is whitelisted solver', () => {
      context('when intent exists', () => {
        context('when intent conditions are met', () => {
          context('when proposal data is valid', () => {
            context('when creating a basic proposal', () => {
              beforeEach('create intent and proposal params', async () => {
                params = await createProposalParams(solverSdk, solverProvider, client, {
                  proposalParams: {
                    instructions: [
                      createTestProposalInstruction({
                        accounts: [createWritableInstructionAccount()],
                        data: TEST_DATA_HEX_1,
                      }),
                    ],
                  },
                })
              })

              it('creates the proposal', async () => {
                await createProposalFromParams()

                const proposal = await program.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.intent.toString()).to.be.eq(sdk.getIntentKey(params.intentHash).toString())
                expect(proposal.creator.toString()).to.be.eq(solver.publicKey.toString())
                expect(proposal.deadline.toNumber()).to.be.eq(params.deadline)
                expect(proposal.isFinal).to.be.true
                expect(proposal.instructions.length).to.be.eq(1)
                expect(proposal.instructions[0].programId.toString()).to.be.eq(
                  params.instructions[0].programId.toString()
                )
                expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq(TEST_DATA_HEX_1)
                expect(proposal.instructions[0].accounts.length).to.be.eq(1)
                expect(proposal.instructions[0].accounts[0].pubkey.toString()).to.be.eq(
                  params.instructions[0].accounts[0].pubkey.toString()
                )
                expect(proposal.instructions[0].accounts[0].isSigner).to.be.eq(false)
                expect(proposal.instructions[0].accounts[0].isWritable).to.be.eq(true)
              })
            })

            context('when creating a proposal with multiple instructions', () => {
              beforeEach('create intent and proposal params', async () => {
                params = await createProposalParams(solverSdk, solverProvider, client, {
                  proposalParams: {
                    instructions: [
                      createTestProposalInstruction({
                        accounts: [createWritableInstructionAccount()],
                        data: TEST_DATA_HEX_1,
                      }),
                      createTestProposalInstruction({
                        accounts: [createSignerInstructionAccount()],
                        data: TEST_DATA_HEX_2,
                      }),
                    ],
                  },
                })
              })

              it('creates the proposal with multiple instructions', async () => {
                await createProposalFromParams()

                const proposal = await program.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.instructions.length).to.be.eq(2)
                expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq(TEST_DATA_HEX_1)
                expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq(TEST_DATA_HEX_2)
                expect(proposal.isFinal).to.be.true
                expect(proposal.instructions[0].accounts.length).to.be.eq(1)
                expect(proposal.instructions[0].accounts[0].pubkey.toString()).to.be.eq(
                  params.instructions[0].accounts[0].pubkey.toString()
                )
                expect(proposal.instructions[0].accounts[0].isSigner).to.be.eq(false)
                expect(proposal.instructions[0].accounts[0].isWritable).to.be.eq(true)
                expect(proposal.instructions[1].accounts.length).to.be.eq(1)
                expect(proposal.instructions[1].accounts[0].pubkey.toString()).to.be.eq(
                  params.instructions[1].accounts[0].pubkey.toString()
                )
                expect(proposal.instructions[1].accounts[0].isSigner).to.be.eq(true)
                expect(proposal.instructions[1].accounts[0].isWritable).to.be.eq(true)
              })
            })

            context('when creating a proposal with empty instructions', () => {
              beforeEach('create intent and proposal params', async () => {
                params = await createProposalParams(solverSdk, solverProvider, client, {
                  proposalParams: {
                    instructions: [],
                  },
                })
              })

              it('creates the proposal with empty instructions', async () => {
                await createProposalFromParams()

                const proposal = await program.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.instructions.length).to.be.eq(0)
              })
            })

            context('when creating proposal with fees matching intent max_fees', () => {
              const testMaxFees = [
                {
                  mint: randomPubkey(),
                  amount: DEFAULT_MAX_FEE,
                },
                {
                  mint: randomPubkey(),
                  amount: DEFAULT_MAX_FEE * 2,
                },
              ]

              beforeEach('create intent and proposal params', async () => {
                const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                  maxFees: testMaxFees,
                })

                params = await createProposalParams(solverSdk, solverProvider, client, {
                  intentHash,
                  proposalParams: { fees: testMaxFees },
                })
              })

              it('creates proposal with correct fees', async () => {
                await createProposalFromParams()

                const proposal = await program.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.fees.length).to.be.eq(2)
                expect(proposal.fees[0].mint.toString()).to.be.eq(testMaxFees[0].mint.toString())
                expect(proposal.fees[0].amount.toString()).to.be.eq(testMaxFees[0].amount.toString())
                expect(proposal.fees[1].mint.toString()).to.be.eq(testMaxFees[1].mint.toString())
                expect(proposal.fees[1].amount.toString()).to.be.eq(testMaxFees[1].amount.toString())
              })
            })
          })

          context('when proposal data is invalid', () => {
            context('when deadline is invalid', () => {
              context('when deadline is in the past', () => {
                beforeEach('create intent and proposal params with past deadline', async () => {
                  const deadline = getCurrentTimestamp(client, -1 * SHORT_DEADLINE)
                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    proposalParams: { deadline },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams('Deadline must be in the future')
              })

              context('when deadline equals now', () => {
                beforeEach('create intent and proposal params with deadline equal to now', async () => {
                  const deadline = getCurrentTimestamp(client)
                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    proposalParams: { deadline },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams('Deadline must be in the future')
              })

              context('when proposal deadline exceeds intent deadline', () => {
                beforeEach('create intent and proposal params with deadline exceeding intent', async () => {
                  const intentHash = await createValidatedIntent(solverSdk, solverProvider, client)
                  const intentDeadline = Number(
                    (await program.account.intent.fetch(sdk.getIntentKey(intentHash))).deadline
                  )

                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    intentHash,
                    proposalParams: { deadline: intentDeadline + SHORT_DEADLINE },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams(`Proposal deadline can't be after the Intent's deadline`)
              })
            })

            context('when fees are invalid', () => {
              context('when fees exceed max_fees', () => {
                const testMaxFees = [
                  {
                    mint: randomPubkey(),
                    amount: DEFAULT_MAX_FEE,
                  },
                  {
                    mint: randomPubkey(),
                    amount: DEFAULT_MAX_FEE * 2,
                  },
                ]

                const largerMaxFees = [testMaxFees[0], { ...testMaxFees[1], amount: testMaxFees[1].amount + 10 }]

                beforeEach('create intent and proposal params', async () => {
                  const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                    maxFees: testMaxFees,
                  })

                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    intentHash,
                    proposalParams: { fees: largerMaxFees },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams('FeeAmountExceedsMaxFee')
              })

              context('when fees have wrong mint', () => {
                const testMaxFees = [
                  {
                    mint: randomPubkey(),
                    amount: DEFAULT_MAX_FEE,
                  },
                ]

                const otherMaxFees = [
                  {
                    mint: randomPubkey(),
                    amount: DEFAULT_MAX_FEE,
                  },
                ]

                beforeEach('create intent and proposal params', async () => {
                  const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                    maxFees: testMaxFees,
                  })

                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    intentHash,
                    proposalParams: { fees: otherMaxFees },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams('InvalidFeeMint')
              })
            })

            context('when proposal with same intent_hash and solver already exists', () => {
              let proposalKey: PublicKey
              let expectedError = ''

              beforeEach('create intent, proposal params, and create first proposal', async () => {
                const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })

                params = await createProposalParams(solverSdk, solverProvider, client, { intentHash })

                const ix = await solverSdk.createProposalIx(intentHash, params)
                await makeTxSignAndSend(solverProvider, ix)
                client.expireBlockhash()

                proposalKey = solverSdk.getProposalKey(intentHash)
                expectedError = `Allocate: account Address { address: ${proposalKey}, base: None } already in use`
              })

              itThrowsAnErrorWhenCreatingProposalFromParams(expectedError)
            })
          })
        })

        context('when intent conditions are not met', () => {
          context('when intent deadline has passed', () => {
            beforeEach('create intent with short deadline and expire it', async () => {
              const intentDeadline = getCurrentTimestamp(client, SHORT_DEADLINE)
              const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                deadline: intentDeadline,
              })

              warpSeconds(provider, intentDeadline + 10)

              params = await createProposalParams(solverSdk, solverProvider, client, { intentHash })
            })

            itThrowsAnErrorWhenCreatingProposalFromParams('Intent has already expired')
          })

          context('when intent has insufficient validations', () => {
            beforeEach('create intent with insufficient validations', async () => {
              const intentHash = await createTestIntent(solverSdk, solverProvider, { minValidations: 2 })
              await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, 1)

              params = await createProposalParams(solverSdk, solverProvider, client, { intentHash })
            })

            itThrowsAnErrorWhenCreatingProposalFromParams('Intent has insufficient validations')
          })

          context('when intent is not final', () => {
            beforeEach('create non-final intent and proposal params', async () => {
              params = await createProposalParams(solverSdk, solverProvider, client, {
                intentOptions: { isFinal: false },
              })
            })

            itThrowsAnErrorWhenCreatingProposalFromParams('Intent is not final')
          })

          context('when fulfilled_intent PDA already exists', () => {
            beforeEach('create intent, mock fulfilled intent, and proposal params', async () => {
              const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })

              // Mock FulfilledIntent
              const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
              client.setAccount(fulfilledIntent, {
                executable: false,
                lamports: 1002240,
                owner: program.programId,
                data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
              })

              params = await createProposalParams(solverSdk, solverProvider, client, { intentHash })
            })

            itThrowsAnErrorWhenCreatingProposalFromParams(
              'AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned'
            )
          })
        })
      })

      context('when intent does not exist', () => {
        let intentHash: string
        let deadline: number
        let instructions: ProposalInstruction[]
        let fees: TokenFee[]

        beforeEach('generate non-existent intent hash and proposal params', async () => {
          intentHash = generateIntentHash()
          deadline = getCurrentTimestamp(client, PROPOSAL_DEADLINE_OFFSET)
          instructions = [createTestProposalInstruction()]
          fees = []
        })

        it('throws an error', async () => {
          const ix = await solverSdk.createProposalIx(intentHash, { instructions, deadline, fees, isFinal: true })
          const res = await makeTxSignAndSend(solverProvider, ix)

          expectTransactionError(res, 'AnchorError caused by account: intent. Error Code: AccountNotInitialized')
        })
      })
    })

    context('when caller is not whitelisted solver', () => {
      beforeEach('create intent and proposal params', async () => {
        params = await createProposalParams(solverSdk, solverProvider, client)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.createProposalIx(params.intentHash, params)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')
      })
    })
  })

  describe('add_instructions_to_proposal', () => {
    const createTestProposal = async (options?: CreateProposalOptions): Promise<string> => {
      const params = await createProposalParams(solverSdk, solverProvider, client, options)
      const ix = await solverSdk.createProposalIx(params.intentHash, params)
      await makeTxSignAndSend(solverProvider, ix)
      return params.intentHash
    }

    const itThrowsAnError = (error: string) => {
      it('throws an error', async () => {
        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, error)
      })
    }

    let intentHash: string
    let moreInstructions: ProposalInstruction[]

    context('when caller is proposal creator', () => {
      context('when proposal exists', () => {
        context('when proposal data is valid', () => {
          context('when not finalizing the proposal', () => {
            context('when calling once', () => {
              context('when adding a single instruction', () => {
                beforeEach('create proposal and instruction params', async () => {
                  intentHash = await createTestProposal({ proposalParams: { isFinal: false } })

                  moreInstructions = [
                    createTestProposalInstruction({
                      programId: randomPubkey(),
                      accounts: [createWritableInstructionAccount()],
                      data: TEST_DATA_HEX_1,
                    }),
                  ]
                })

                it('adds the instruction to the proposal', async () => {
                  const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const proposal = await program.account.proposal.fetch(
                    sdk.getProposalKey(intentHash, solver.publicKey)
                  )
                  expect(proposal.instructions.length).to.be.eq(2)
                  expect(Buffer.from(proposal.instructions[0].data).toString('hex')).to.be.eq(TEST_DATA_HEX_3)
                  expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq(TEST_DATA_HEX_1)
                  expect(proposal.isFinal).to.be.false
                  expect(proposal.instructions[1].programId.toString()).to.be.eq(
                    moreInstructions[0].programId.toString()
                  )
                  expect(proposal.instructions[1].accounts.length).to.be.eq(1)
                  expect(proposal.instructions[1].accounts[0].pubkey.toString()).to.be.eq(
                    moreInstructions[0].accounts[0].pubkey.toString()
                  )
                  expect(proposal.instructions[1].accounts[0].isSigner).to.be.eq(false)
                  expect(proposal.instructions[1].accounts[0].isWritable).to.be.eq(true)
                })
              })

              context('when adding multiple instructions', () => {
                beforeEach('create proposal and instruction params', async () => {
                  intentHash = await createTestProposal({ proposalParams: { isFinal: false } })

                  moreInstructions = [
                    createTestProposalInstruction({ data: TEST_DATA_HEX_1 }),
                    createTestProposalInstruction({ data: TEST_DATA_HEX_2 }),
                  ]
                })

                it('adds multiple instructions to the proposal', async () => {
                  const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const proposal = await program.account.proposal.fetch(
                    sdk.getProposalKey(intentHash, solver.publicKey)
                  )
                  expect(proposal.instructions.length).to.be.eq(3)
                  expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq(TEST_DATA_HEX_1)
                  expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq(TEST_DATA_HEX_2)
                  expect(proposal.isFinal).to.be.false
                })
              })

              context('when passing finalize=false', () => {
                beforeEach('create proposal and instruction params', async () => {
                  intentHash = await createTestProposal({ proposalParams: { isFinal: false } })

                  moreInstructions = [createTestProposalInstruction()]
                })

                it('does not finalize the proposal', async () => {
                  const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const proposal = await program.account.proposal.fetch(
                    sdk.getProposalKey(intentHash, solver.publicKey)
                  )
                  expect(proposal.isFinal).to.be.false
                  expect(proposal.instructions.length).to.be.eq(2)
                })
              })
            })

            context('when calling more than once', () => {
              context('when adding instructions multiple times', () => {
                let moreInstructions1: ProposalInstruction[]
                let moreInstructions2: ProposalInstruction[]

                beforeEach('create proposal and instruction params', async () => {
                  intentHash = await createTestProposal({ proposalParams: { isFinal: false } })

                  moreInstructions1 = [createTestProposalInstruction({ data: TEST_DATA_HEX_1 })]
                  moreInstructions2 = [createTestProposalInstruction({ data: TEST_DATA_HEX_2 })]
                })

                it('adds instructions to the proposal multiple times', async () => {
                  const ix1 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions1, false)
                  await makeTxSignAndSend(solverProvider, ix1)

                  const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions2, false)
                  await makeTxSignAndSend(solverProvider, ix2)

                  const proposal = await program.account.proposal.fetch(
                    sdk.getProposalKey(intentHash, solver.publicKey)
                  )
                  expect(proposal.instructions.length).to.be.eq(3)
                  expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq(TEST_DATA_HEX_1)
                  expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq(TEST_DATA_HEX_2)
                  expect(proposal.isFinal).to.be.false
                })
              })
            })
          })

          context('when finalizing the proposal', () => {
            context('when passing finalize=true', () => {
              beforeEach('create proposal and instruction params', async () => {
                intentHash = await createTestProposal({ proposalParams: { isFinal: false } })
                moreInstructions = [createTestProposalInstruction()]
              })

              it('finalizes the proposal', async () => {
                const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, true)
                await makeTxSignAndSend(solverProvider, ix)

                const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
                expect(proposal.isFinal).to.be.true
                expect(proposal.instructions.length).to.be.eq(2)
              })
            })
          })
        })

        context('when proposal data is not valid', () => {
          context('when proposal is not final', () => {
            context('when proposal has expired', () => {
              context('when proposal deadline has passed', () => {
                beforeEach('create proposal with short deadline and warp time', async () => {
                  intentHash = await createTestProposal({
                    proposalParams: { deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
                  })
                  warpSeconds(solverProvider, WARP_TIME_LONG)
                  moreInstructions = []
                })

                itThrowsAnError('Proposal has already expired')
              })

              context('when proposal deadline equals now', () => {
                beforeEach('create proposal with short deadline and warp time', async () => {
                  intentHash = await createTestProposal({
                    proposalParams: { deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
                  })
                  warpSeconds(solverProvider, SHORT_DEADLINE)
                  moreInstructions = []
                })

                itThrowsAnError('Proposal has already expired')
              })
            })
          })

          context('when proposal is final', () => {
            beforeEach('create finalized proposal and instruction params', async () => {
              intentHash = await createTestProposal({ proposalParams: { isFinal: true } })
              moreInstructions = []
            })

            itThrowsAnError('Proposal is already final')
          })
        })
      })

      context('when proposal does not exist', () => {
        beforeEach('generate non-existent intent hash and instruction params', () => {
          intentHash = generateIntentHash()
          moreInstructions = []
        })

        itThrowsAnError('AccountNotInitialized')
      })
    })

    context('when caller is not proposal creator', () => {
      let proposalCreator: PublicKey

      beforeEach('create proposal and instruction params', async () => {
        intentHash = await createTestProposal({ proposalParams: { isFinal: false } })
        proposalCreator = (await program.account.proposal.fetch(solverSdk.getProposalKey(intentHash))).creator
        moreInstructions = []
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
  })

  describe('claim_stale_proposal', () => {
    const createTestProposal = async (options?: CreateProposalOptions): Promise<string> => {
      const params = await createProposalParams(solverSdk, solverProvider, client, options)
      const ix = await solverSdk.createProposalIx(params.intentHash, params)
      await makeTxSignAndSend(solverProvider, ix)
      return params.intentHash
    }

    const itThrowsAnError = (error: string) => {
      it('throws an error', async () => {
        const ix = await solverSdk.claimStaleProposalIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, error)
      })
    }

    let intentHash: string

    context('when caller is proposal creator', () => {
      context('when proposal exists', () => {
        context('when proposal is stale', () => {
          let proposalKey: PublicKey

          before('create proposal with short deadline and warp time', async () => {
            intentHash = await createTestProposal({
              proposalParams: { deadline: getCurrentTimestamp(client, STALE_CLAIM_DELAY) },
            })
            proposalKey = solverSdk.getProposalKey(intentHash)
            warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)
          })

          it('claims the stale proposal', async () => {
            const proposalBefore = await program.account.proposal.fetch(proposalKey)
            const proposalBalanceBefore = Number(provider.client.getBalance(proposalKey)) || 0
            const proposalCreatorBalanceBefore = Number(provider.client.getBalance(proposalBefore.creator)) || 0

            const ix = await solverSdk.claimStaleProposalIx(intentHash)
            await makeTxSignAndSend(solverProvider, ix)

            const proposalBalanceAfter = Number(provider.client.getBalance(proposalKey)) || 0
            const proposalCreatorBalanceAfter = Number(provider.client.getBalance(proposalBefore.creator)) || 0

            try {
              await program.account.proposal.fetch(proposalKey)
              expect.fail('Proposal account should be closed')
            } catch (error: any) {
              expect(error.message).to.include(`Account does not exist`)
            }

            expect(proposalCreatorBalanceAfter).to.be.eq(
              proposalCreatorBalanceBefore + proposalBalanceBefore - ACCOUNT_CLOSE_FEE
            )
            expect(proposalBalanceAfter).to.be.eq(0)
          })

          it('cannot claim the stale proposal again', async () => {
            client.expireBlockhash()
            const ix = await solverSdk.claimStaleProposalIx(intentHash)
            const res = await makeTxSignAndSend(solverProvider, ix)

            expectTransactionError(res, 'AnchorError caused by account: proposal. Error Code: AccountNotInitialized')
          })
        })

        context('when proposal is not stale', () => {
          context('when deadline has not passed', () => {
            beforeEach('create proposal and warp time', async () => {
              intentHash = await createTestProposal({
                proposalParams: { deadline: getCurrentTimestamp(client, LONG_DEADLINE) },
              })
              warpSeconds(provider, WARP_TIME_SHORT)
            })

            itThrowsAnError('Proposal not yet expired')
          })

          context('when deadline equals now', () => {
            beforeEach('create proposal and warp time', async () => {
              intentHash = await createTestProposal({
                proposalParams: { deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
              })
              warpSeconds(provider, WARP_TIME_SHORT)
            })

            itThrowsAnError('Proposal not yet expired')
          })
        })
      })

      context('when proposal does not exist', () => {
        beforeEach('generate non-existent intent hash', () => {
          intentHash = generateIntentHash()
        })

        itThrowsAnError('AnchorError caused by account: proposal. Error Code: AccountNotInitialized')
      })
    })

    context('when caller is not proposal creator', () => {
      beforeEach('create proposal and warp time', async () => {
        intentHash = await createTestProposal({
          proposalParams: { deadline: getCurrentTimestamp(client, STALE_CLAIM_DELAY) },
        })
        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.claimStaleProposalIx(intentHash, solver.publicKey)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be proposal creator`)
      })
    })
  })
})
