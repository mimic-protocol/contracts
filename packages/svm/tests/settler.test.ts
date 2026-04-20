/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Address, Program, translateAddress, Wallet, web3 } from '@coral-xyz/anchor'
import {
  bytesToHex,
  Chains,
  CreateProposalParams,
  EntityType,
  EthersSigner,
  ExtendIntentParams,
  hexToBytes,
  Intent,
  OpType,
  Proposal,
  ProposalInstruction,
  ProposalSigner,
  randomHex,
  SETTLER_EIP712_DOMAIN,
  SolanaEip712Domain,
  SvmController,
  SvmSettler,
  TransferIntentData,
  ValidatorSigner,
} from '@mimicprotocol/sdk'
import { svmDecodeTransferIntent, svmEncodeTransferIntent } from '@mimicprotocol/sdk/dist/shared/codec/chains/svm'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  AccountMeta,
  CreateSecp256k1InstructionWithEthAddressParams,
  Keypair,
  PublicKey,
  Secp256k1Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { BN } from 'bn.js'
import { expect } from 'chai'
import { ethers } from 'ethers'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import * as ControllerIDL from '../target/idl/controller.json'
import * as SettlerIDL from '../target/idl/settler.json'
import { Settler } from '../target/types/settler'
import {
  ACCOUNT_CLOSE_FEE,
  addValidatorsToIntent,
  createAllowlistedEntity,
  createAxiaSignature,
  CreateIntentOptions,
  createIntentParams,
  CreateProposalOptions,
  createProposalParams,
  createSignerInstructionAccount,
  createTestIntent,
  createTestProposalInstruction,
  createValidatedIntent,
  createValidatorSignature,
  createWritableInstructionAccount,
  DEFAULT_DATA_HEX,
  DEFAULT_MAX_FEE,
  EMPTY_DATA_HEX,
  ethAddressToByteArray,
  expectTransactionError,
  EXPIRATION_TEST_DELAY,
  EXPIRATION_TEST_DELAY_PLUS_ONE,
  generateIntentHash,
  generateNonce,
  getCurrentTimestamp,
  LONG_DEADLINE,
  MEDIUM_DEADLINE,
  PROPOSAL_DEADLINE_OFFSET,
  ProposalAccount,
  randomKeypair,
  randomPubkey,
  removeEntityFromAllowlist,
  SHORT_DEADLINE,
  STALE_CLAIM_DELAY,
  STALE_CLAIM_DELAY_PLUS_ONE,
  TEST_DATA_HEX_1,
  TEST_DATA_HEX_2,
  TEST_DATA_HEX_3,
  toLamports,
  WARP_TIME_LONG,
  WARP_TIME_SHORT,
} from './helpers'
import { approveDelegate, createFundedAta, createMint, getAtaBalance, revokeDelegate } from './helpers/spl'
import { makeTxSignAndSend, warpSeconds } from './utils'

describe('Settler', () => {
  let client: LiteSVM

  let adminProvider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider
  let solverProvider: LiteSVMProvider

  let admin: Keypair
  let malicious: Keypair
  let solver: Keypair

  let settler: Program<Settler>

  let sdk: SvmSettler
  let maliciousSdk: SvmSettler
  let solverSdk: SvmSettler
  let adminSdk: SvmSettler

  let controllerSdk: SvmController

  before(async () => {
    admin = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    malicious = randomKeypair()
    solver = randomKeypair()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins().withPrecompiles().withSysvars()

    adminProvider = new LiteSVMProvider(client, new Wallet(admin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))
    solverProvider = new LiteSVMProvider(client, new Wallet(solver))

    settler = new Program<Settler>(SettlerIDL as any, adminProvider)

    sdk = new SvmSettler(adminProvider)
    maliciousSdk = new SvmSettler(maliciousProvider)
    solverSdk = new SvmSettler(solverProvider)
    adminSdk = new SvmSettler(adminProvider)

    adminProvider.client.airdrop(admin.publicKey, toLamports(100))
    adminProvider.client.airdrop(malicious.publicKey, toLamports(100))
    adminProvider.client.airdrop(solver.publicKey, toLamports(100))

    // Initialize Controller and add Solver to allowlist
    controllerSdk = new SvmController(adminProvider)
    await makeTxSignAndSend(adminProvider, await controllerSdk.initializeIx(admin.publicKey, 1))
    await makeTxSignAndSend(adminProvider, await controllerSdk.setAllowedEntityIx(EntityType.Solver, solver.publicKey))
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('initialize', () => {
    context('when caller is not deployer', () => {
      it('cannot initialize if not deployer', async () => {
        const ix = await maliciousSdk.initializeIx({})
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only Deployer can call this instruction.')
      })
    })

    context('when caller is deployer', () => {
      const domain = {
        name: 'Test',
        version: '1.0.0',
        chainId: 507424,
      }

      it('should call initialize', async () => {
        const ix = await sdk.initializeIx(domain)
        await makeTxSignAndSend(adminProvider, ix)

        const settings = await settler.account.settlerSettings.fetch(sdk.getSettlerSettingsKey())
        expect(settings.controllerProgram.toString()).to.be.eq(ControllerIDL.address)
        expect(bytesToHex(Buffer.from(settings.eip712DomainHash))).to.be.eq(ethers.TypedDataEncoder.hashDomain(domain))
      })

      it('cannot call initialize again', async () => {
        const ix = await sdk.initializeIx({})
        const res = await makeTxSignAndSend(adminProvider, ix)

        expectTransactionError(res, 'already in use')
      })
    })
  })

  describe('update_eip712_domain', () => {
    context('when caller is controller admin', () => {
      context('when domain is valid', () => {
        const itUpdatesDomainCorrectly = (testCase: string, domain: SolanaEip712Domain) => {
          it(`updates domain correctly (${testCase})`, async () => {
            const ix = await adminSdk.updateEip712DomainIx(domain)
            const res = await makeTxSignAndSend(adminProvider, ix)
            const settings = await settler.account.settlerSettings.fetch(adminSdk.getSettlerSettingsKey())
            expect(res.toString()).to.not.include('FailedTransaction')
            expect(bytesToHex(Buffer.from(settings.eip712DomainHash))).to.be.eq(
              ethers.TypedDataEncoder.hashDomain(domain)
            )
          })
        }

        itUpdatesDomainCorrectly('only name', { name: 'Only Name' })
        itUpdatesDomainCorrectly('only version', { version: '1.2.3' })
        itUpdatesDomainCorrectly('name and version', { name: 'Name and Version', version: '1.2.3' })
        itUpdatesDomainCorrectly('all fields', {
          name: 'All Fields',
          version: '2.2.2',
          chainId: 14,
          salt: Uint8Array.from(Array(32).fill(6)),
        })
        itUpdatesDomainCorrectly('all fields no salt', { name: 'All Fields no Salt', version: '0.1.0', chainId: 49 })
        itUpdatesDomainCorrectly('empty domain', {})
        itUpdatesDomainCorrectly('empty name', { name: '' })
        itUpdatesDomainCorrectly('empty version', { version: '' })
        itUpdatesDomainCorrectly('empty name and version', { name: '', version: '' })
      })

      context('when domain is invalid', () => {
        const itThrowsAnError = (testCase: string, domain: SolanaEip712Domain, error: string) => {
          it(`throws an error (${testCase})`, async () => {
            const ix = await settler.methods
              .updateEip712Domain({
                name: null,
                version: null,
                ...domain,
                salt: domain.salt ? Array.from(domain.salt) : null,
                chainId: domain.chainId ? new BN(domain.chainId) : null,
              })
              .instruction()
            const res = await makeTxSignAndSend(adminProvider, ix)
            expectTransactionError(res, error)
          })
        }

        itThrowsAnError('salt too short', { salt: Uint8Array.from([]) }, 'InstructionDidNotDeserialize.')
      })
    })

    context('when caller is not controller admin', () => {
      it('throws an error', async () => {
        const ix = await solverSdk.updateEip712DomainIx({})
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res, 'OnlyControllerAdmin')
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
            const itWorksAsExpected = (minValidations: number) => {
              const intentOptions: CreateIntentOptions = {
                op: OpType.Transfer,
                user: randomPubkey(),
                nonce: generateNonce(),
                deadline: '10000',
                minValidations,
                data: TEST_DATA_HEX_1,
                maxFees: [
                  {
                    token: randomPubkey(),
                    amount: '1000',
                  },
                ],
                events: [
                  {
                    topic: randomHex(32).slice(2),
                    data: randomHex(100).slice(2),
                  },
                ],
                isFinal: true,
              }

              it('creates the intent with correct properties', async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
                const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))

                expect(intent.op).to.deep.include({ transfer: {} })
                expect(intent.user.toString()).to.be.eq(intentOptions.user!.toString())
                expect(intent.creator.toString()).to.be.eq(solver.publicKey.toString())
                expect(bytesToHex(Buffer.from(intent.nonce))).to.be.eq(intentOptions.nonce)
                expect(intent.deadline.toString()).to.be.eq(intentOptions.deadline)
                expect(intent.minValidations).to.be.eq(
                  Math.max(controllerMinValidations, intentOptions.minValidations ?? 0)
                )
                expect(intent.isFinal).to.be.true
                expect(Buffer.from(intent.data).toString('hex')).to.be.eq(intentOptions.data)
                expect(intent.maxFees.length).to.be.eq(1)
                expect(intent.maxFees[0].amount.toNumber()).to.be.eq(1000)
                expect(intent.events.length).to.be.eq(1)
                expect(intent.validators.length).to.be.eq(0)
                expect(Buffer.from(intent.events[0].data).toString('hex')).to.be.eq(intentOptions.events![0].data)
              })
            }

            const controllerMinValidations = 3

            before('Set Controller min validations to 3 for tests', async () => {
              const ix = await controllerSdk.setMinValidationsIx(controllerMinValidations)
              await makeTxSignAndSend(adminProvider, ix)
            })

            context("when intent minValidations are less than Controller's", () => {
              itWorksAsExpected(controllerMinValidations - 1)
            })

            context("when intent minValidations are more than Controller's", () => {
              itWorksAsExpected(controllerMinValidations + 1)
            })

            context("when intent minValidations are equal to Controller's", () => {
              itWorksAsExpected(controllerMinValidations)
            })

            after('Restore Controller min validations to 1 for future tests', async () => {
              const ix = await controllerSdk.setMinValidationsIx(1)
              await makeTxSignAndSend(adminProvider, ix)
            })
          })

          context('when creating an intent with empty data', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              data: EMPTY_DATA_HEX,
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
              expect(intent.op).to.deep.include({ transfer: {} })
              expect(Buffer.from(intent.data).toString('hex')).to.be.eq(EMPTY_DATA_HEX)
              expect(intent.isFinal).to.be.true
            })
          })

          context('when creating an intent with empty events', () => {
            intentHash = generateIntentHash()
            const intentOptions: CreateIntentOptions = {
              events: [],
            }

            it('creates the intent', async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, intentOptions)
              const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
              const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
              const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
                owner: settler.programId,
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
            intentHash = '0x123456' // invalid - not 32 bytes
            intentOptions = {}

            // Build ix with invalid hash
            const params = createIntentParams(client, intentOptions)
            const { op, user, nonce, deadline, minValidations, data, maxFees, events } = params

            const intentHashParam = Array.from(hexToBytes(intentHash))
            const nonceArray = Array.from(hexToBytes(nonce))
            const dataArray = hexToBytes(data)
            const maxFeesBn = maxFees.map((tokenFee) => ({
              token: translateAddress(tokenFee.token),
              amount: new BN(tokenFee.amount),
            }))
            const eventsArray = events.map((eventHex) => ({
              topic: Array.from(Uint8Array.from(hexToBytes(eventHex.topic))),
              data: hexToBytes(eventHex.data),
            }))
            const intentKey = PublicKey.findProgramAddressSync(
              [Buffer.from('intent'), hexToBytes(intentHash)],
              settler.programId
            )[0]

            ix = await settler.methods
              .createIntent(
                intentHashParam,
                dataArray,
                maxFeesBn,
                eventsArray,
                minValidations,
                solverSdk.opTypeToAnchorEnum(op),
                translateAddress(user),
                nonceArray,
                new BN(deadline),
                false
              )
              .accountsPartial({
                intent: intentKey,
                solver: solverSdk.getSignerKey(),
                solverRegistry: solverSdk.getEntityRegistryKey(EntityType.Solver, solver.publicKey),
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

                  const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
                        token: randomPubkey(),
                        amount: '2000',
                      },
                    ],
                  }
                })

                it('extends the intent with more max_fees', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(intent.maxFees.length).to.be.eq(2)
                  expect(intent.maxFees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE)
                  expect(intent.maxFees[1].token.toString()).to.be.eq(extendParams.moreMaxFees![0].token.toString())
                  expect(intent.maxFees[1].amount.toString()).to.be.eq(extendParams.moreMaxFees![0].amount)
                })
              })

              context('when extending with more events', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                  extendParams = {
                    moreEventsHex: [
                      {
                        topic: randomHex(32).slice(2),
                        data: TEST_DATA_HEX_2,
                      },
                    ],
                  }
                })

                it('extends the intent with more events', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(intent.events.length).to.be.eq(2)
                  expect(Buffer.from(intent.events[1].topic).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].topic
                  )
                  expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].data
                  )
                })
              })

              context('when extending with all optional fields', () => {
                beforeEach('create intent and extend params', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    data: TEST_DATA_HEX_1,
                  })
                  extendParams = {
                    moreDataHex: TEST_DATA_HEX_2,
                    moreMaxFees: [
                      {
                        token: randomPubkey(),
                        amount: '3000',
                      },
                    ],
                    moreEventsHex: [
                      {
                        topic: randomHex(32).slice(2),
                        data: TEST_DATA_HEX_3,
                      },
                    ],
                  }
                })

                it('extends the intent with all optional fields', async () => {
                  const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
                  await makeTxSignAndSend(solverProvider, ix)

                  const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
                  expect(Buffer.from(intent.data).toString('hex')).to.be.eq(`${TEST_DATA_HEX_1}${TEST_DATA_HEX_2}`)
                  expect(intent.maxFees.length).to.be.eq(2)
                  expect(intent.maxFees[1].amount.toString()).to.be.eq(extendParams.moreMaxFees![0].amount)
                  expect(intent.events.length).to.be.eq(2)
                  expect(Buffer.from(intent.events[1].topic).toString('hex')).to.be.eq(
                    extendParams.moreEventsHex![0].topic
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
                    { topic: randomHex(32).slice(2), data: randomHex(400).slice(2) },
                    { topic: randomHex(32).slice(2), data: randomHex(400).slice(2) },
                  ],
                  moreMaxFees: [
                    { token: randomPubkey(), amount: '1' },
                    { token: randomPubkey(), amount: `${1 + 1000}` },
                    { token: randomPubkey(), amount: `${1 + 2000}` },
                  ],
                }

                before('create intent', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    data: '',
                    events: [],
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
                      expect(res.toString()).to.include(`Program ${settler.programId} success`)
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
                  const intent = await settler.account.intent.fetch(intentKey)
                  const intentAcc = client.getAccount(intentKey)
                  expect(intent.data.length).to.be.eq(5000)
                  expect(intent.maxFees.length).to.be.eq(55)
                  expect(intent.events.length).to.be.eq(44)
                  expect(intent.isFinal).to.be.false
                  expect(intentAcc?.data.length).to.be.eq(26569)
                })
              })

              context('when extending multiple times', () => {
                let extendParams1: ExtendIntentParams
                let extendParams2: ExtendIntentParams

                before('create intent', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, {
                    isFinal: false,
                    data: TEST_DATA_HEX_1,
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
                  const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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

                const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
                expect(intent.isFinal).to.be.true
              })
            })

            context('when extending and finalizing in one call', () => {
              beforeEach('create intent and extend params', async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, {
                  isFinal: false,
                  data: TEST_DATA_HEX_2,
                })
                extendParams = { moreDataHex: randomHex(6).slice(2) }
              })

              it('extends and finalizes the intent in one call', async () => {
                const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
                await makeTxSignAndSend(solverProvider, ix)

                const intent = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
          const res = await makeTxSignAndSend(adminProvider, ix)

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

        expectTransactionError(res, `Incorrect intent creator`)
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

              warpSeconds(adminProvider, STALE_CLAIM_DELAY_PLUS_ONE)
            })

            it('claims the stale intent', async () => {
              const intentBefore = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
              const intentBalanceBefore = Number(adminProvider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceBefore = Number(adminProvider.client.getBalance(intentBefore.creator)) || 0

              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              await makeTxSignAndSend(solverProvider, ix)

              const intentBalanceAfter = Number(adminProvider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceAfter = Number(adminProvider.client.getBalance(intentBefore.creator)) || 0

              try {
                await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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

              warpSeconds(adminProvider, STALE_CLAIM_DELAY_PLUS_ONE)
            })

            it('claims the stale intent', async () => {
              const intentBefore = await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
              const intentBalanceBefore = Number(adminProvider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceBefore = Number(adminProvider.client.getBalance(intentBefore.creator)) || 0

              const ix = await solverSdk.claimStaleIntentIx(intentHash)
              await makeTxSignAndSend(solverProvider, ix)

              const intentBalanceAfter = Number(adminProvider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
              const intentCreatorBalanceAfter = Number(adminProvider.client.getBalance(intentBefore.creator)) || 0

              try {
                await settler.account.intent.fetch(sdk.getIntentKey(intentHash))
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
              warpSeconds(adminProvider, WARP_TIME_SHORT)
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
              warpSeconds(adminProvider, MEDIUM_DEADLINE)
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
        warpSeconds(adminProvider, EXPIRATION_TEST_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await maliciousSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, `Incorrect intent creator`)
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

                const proposal = await settler.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.intent.toString()).to.be.eq(sdk.getIntentKey(params.intentHash).toString())
                expect(proposal.creator.toString()).to.be.eq(solver.publicKey.toString())
                expect(proposal.deadline.toString()).to.be.eq(params.deadline)
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

                const proposal = await settler.account.proposal.fetch(
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

                const proposal = await settler.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.instructions.length).to.be.eq(0)
              })
            })

            context('when creating proposal with fees matching intent max_fees', () => {
              const testMaxFees = [
                {
                  token: randomPubkey(),
                  amount: `${DEFAULT_MAX_FEE}`,
                },
                {
                  token: randomPubkey(),
                  amount: `${DEFAULT_MAX_FEE * 2}`,
                },
              ]

              beforeEach('create intent and proposal params', async () => {
                const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                  maxFees: testMaxFees,
                })

                params = await createProposalParams(solverSdk, solverProvider, client, {
                  intentHash,
                  proposalParams: { fees: testMaxFees.map((fee) => fee.amount) },
                })
              })

              it('creates proposal with correct fees', async () => {
                await createProposalFromParams()

                const proposal = await settler.account.proposal.fetch(
                  sdk.getProposalKey(params.intentHash, solver.publicKey)
                )
                expect(proposal.fees.length).to.be.eq(2)
                expect(proposal.fees[0].toString()).to.be.eq(testMaxFees[0].amount)
                expect(proposal.fees[1].toString()).to.be.eq(testMaxFees[1].amount)
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
                    (await settler.account.intent.fetch(sdk.getIntentKey(intentHash))).deadline
                  )

                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    intentHash,
                    proposalParams: { deadline: `${intentDeadline + SHORT_DEADLINE}` },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams(`Proposal deadline can't be after the Intent's deadline`)
              })
            })

            context('when fees are invalid', () => {
              context('when fees exceed max_fees', () => {
                const testMaxFees = [
                  {
                    token: randomPubkey(),
                    amount: `${DEFAULT_MAX_FEE}`,
                  },
                  {
                    token: randomPubkey(),
                    amount: `${DEFAULT_MAX_FEE * 2}`,
                  },
                ]

                const largerMaxFees = [testMaxFees[0], { ...testMaxFees[1], amount: testMaxFees[1].amount + 10 }]

                beforeEach('create intent and proposal params', async () => {
                  const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                    maxFees: testMaxFees,
                  })

                  params = await createProposalParams(solverSdk, solverProvider, client, {
                    intentHash,
                    proposalParams: { fees: largerMaxFees.map((fee) => fee.amount) },
                  })
                })

                itThrowsAnErrorWhenCreatingProposalFromParams('FeeAmountExceedsMaxFee')
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

              warpSeconds(adminProvider, Number(intentDeadline) + 10)

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
                owner: settler.programId,
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
        let deadline: string
        let instructions: ProposalInstruction[]
        let fees: string[]

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

                  const proposal = await settler.account.proposal.fetch(
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

                  const proposal = await settler.account.proposal.fetch(
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

                  const proposal = await settler.account.proposal.fetch(
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

                  const proposal = await settler.account.proposal.fetch(
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

                const proposal = await settler.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
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
      beforeEach('create proposal and instruction params', async () => {
        intentHash = await createTestProposal({ proposalParams: { isFinal: false } })
        moreInstructions = []
      })

      it('throws an error', async () => {
        const ix = await settler.methods
          .addInstructionsToProposal([], true)
          .accountsPartial({
            creator: malicious.publicKey,
            proposal: solverSdk.getProposalKey(intentHash),
          })
          .instruction()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Incorrect proposal creator`)
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
            warpSeconds(adminProvider, STALE_CLAIM_DELAY_PLUS_ONE)
          })

          it('claims the stale proposal', async () => {
            const proposalBefore = await settler.account.proposal.fetch(proposalKey)
            const proposalBalanceBefore = Number(adminProvider.client.getBalance(proposalKey)) || 0
            const proposalCreatorBalanceBefore = Number(adminProvider.client.getBalance(proposalBefore.creator)) || 0

            const ix = await solverSdk.claimStaleProposalIx(intentHash)
            await makeTxSignAndSend(solverProvider, ix)

            const proposalBalanceAfter = Number(adminProvider.client.getBalance(proposalKey)) || 0
            const proposalCreatorBalanceAfter = Number(adminProvider.client.getBalance(proposalBefore.creator)) || 0

            try {
              await settler.account.proposal.fetch(proposalKey)
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
              warpSeconds(adminProvider, WARP_TIME_SHORT)
            })

            itThrowsAnError('Proposal not yet expired')
          })

          context('when deadline equals now', () => {
            beforeEach('create proposal and warp time', async () => {
              intentHash = await createTestProposal({
                proposalParams: { deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
              })
              warpSeconds(adminProvider, WARP_TIME_SHORT)
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
        warpSeconds(adminProvider, STALE_CLAIM_DELAY_PLUS_ONE)
      })

      it('throws an error', async () => {
        const ix = await settler.methods
          .claimStaleProposal()
          .accountsPartial({
            creator: malicious.publicKey,
            proposal: solverSdk.getProposalKey(intentHash),
          })
          .instruction()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Incorrect proposal creator`)
      })
    })
  })

  describe('add_validator_sigs', () => {
    const createAllowlistedValidator = async () => {
      const validator = ethers.Wallet.createRandom()
      await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Validator, hexToBytes(validator.address))
      return validator
    }

    const createSigAndIxs = async (
      hash: string = intentHash,
      ethValidator: ethers.HDNodeWallet = validator,
      secp256k1IxOptions: Partial<CreateSecp256k1InstructionWithEthAddressParams> = {},
      accountsPartial: Partial<{
        fulfilledIntent: Address
        intent: Address
        validatorRegistry: Address
      }> = {}
    ) => {
      const { signature, recoveryId } = await createValidatorSignature(
        hash,
        EthersSigner.fromPrivateKey(ethValidator.privateKey)
      )

      const validatorEthAddress = hexToBytes(ethValidator.address)
      const eip712Preimage = new ValidatorSigner().getIntentMessage({
        hash,
        settler: settler.programId.toString(),
        chainId: Chains.Solana,
      })

      const secp256k1Ix = Secp256k1Program.createInstructionWithEthAddress({
        message: hexToBytes(eip712Preimage),
        ethAddress: validatorEthAddress,
        signature: Buffer.from(signature),
        recoveryId,
        ...secp256k1IxOptions,
      })

      const ix = await settler.methods
        .addValidatorSig()
        .accountsPartial({
          solver: solverSdk.getSignerKey(),
          solverRegistry: solverSdk.getEntityRegistryKey(EntityType.Solver, solverSdk.getSignerKey()),
          intent: solverSdk.getIntentKey(hash),
          fulfilledIntent: solverSdk.getFulfilledIntentKey(hash),
          validatorRegistry: solverSdk.getEntityRegistryKey(EntityType.Validator, validatorEthAddress),
          ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          ...accountsPartial,
        })
        .instruction()

      return [secp256k1Ix, ix]
    }

    const itThrowsAnError = async (error: string) => {
      it('throws an error', async () => {
        const res = await makeTxSignAndSend(solverProvider, ...ixs)
        expectTransactionError(res, error)
      })
    }

    let intentHash: string
    let validator: ethers.HDNodeWallet
    let ixs: TransactionInstruction[]

    before('set correct domain', async () => {
      const ix = await adminSdk.updateEip712DomainIx({
        ...SETTLER_EIP712_DOMAIN,
        chainId: Chains.Solana,
      })
      await makeTxSignAndSend(adminProvider, ix)
    })

    context('when caller is whitelisted solver', () => {
      context('when intent was created', () => {
        context('when intent conditions are met', () => {
          context('when signature is cryptographically valid', () => {
            context('when signature is logically valid', () => {
              context('when adding valid signatures', () => {
                context('when adding one signature', () => {
                  before(async () => {
                    intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
                    validator = await createAllowlistedValidator()
                    ixs = await createSigAndIxs()
                  })

                  it('should add validator to intent validators array', async () => {
                    const intentBefore = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))
                    await makeTxSignAndSend(solverProvider, ...ixs)
                    const intentAfter = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))

                    expect(intentBefore.validators.length).to.be.eq(0)
                    expect(intentAfter.validators.length).to.be.eq(1)
                    expect(intentAfter.validators[0]).to.be.deep.eq(ethAddressToByteArray(validator.address))
                  })

                  it('should not add the validator twice (idempotent ix)', async () => {
                    client.expireBlockhash()
                    ixs = await createSigAndIxs()
                    const res = await makeTxSignAndSend(solverProvider, ...ixs)

                    const intentAfter = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))

                    expect(res.toString()).to.not.include('FailedTransactionMetadata')
                    expect(intentAfter.validators.length).to.be.eq(1)
                    expect(intentAfter.validators[0]).to.be.deep.eq(ethAddressToByteArray(validator.address))
                  })
                })

                context('when adding multiple signatures', () => {
                  const validators: ethers.HDNodeWallet[] = []
                  const sigIxs: TransactionInstruction[][] = []

                  before('creates multiple allowlisted validators and signatures', async () => {
                    intentHash = await createTestIntent(solverSdk, solverProvider, { minValidations: 3, isFinal: true })
                    for (let i = 0; i < 3; i++) {
                      const validator = await createAllowlistedValidator()
                      const ixs = await createSigAndIxs(undefined, validator)
                      validators.push(validator)
                      sigIxs.push(ixs)
                    }
                  })

                  it('should add validators to intent validators array', async () => {
                    for (let i = 0; i < 3; i++) {
                      const validator = validators[i]
                      const ixs = sigIxs[i]

                      const intentBefore = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))
                      await makeTxSignAndSend(solverProvider, ...ixs)
                      const intentAfter = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))

                      expect(intentBefore.validators.length).to.be.eq(i)
                      expect(intentAfter.validators.length).to.be.eq(i + 1)
                      expect(intentAfter.validators[i]).to.be.deep.eq(ethAddressToByteArray(validator.address))
                    }
                  })
                })
              })
            })

            context('when signature is logically invalid', () => {
              context('when domain does not match', () => {
                before(async () => {
                  client.expireBlockhash()
                  intentHash = await createTestIntent(solverSdk, solverProvider)
                  ixs = await createSigAndIxs()
                  const ix = await adminSdk.updateEip712DomainIx({ name: 'Other Domain' })
                  await makeTxSignAndSend(adminProvider, ix)
                })

                after(async () => {
                  client.expireBlockhash()
                  const ix = await adminSdk.updateEip712DomainIx({
                    ...SETTLER_EIP712_DOMAIN,
                    chainId: Chains.Solana,
                  })
                  await makeTxSignAndSend(adminProvider, ix)
                })

                itThrowsAnError('SigVerificationFailedIncorrectMessage')
              })

              context('when validator is not whitelisted', () => {
                before(async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                  validator = ethers.Wallet.createRandom()
                  ixs = await createSigAndIxs()
                })

                itThrowsAnError(
                  'Program log: AnchorError caused by account: validator_registry. Error Code: AccountNotInitialized'
                )
              })

              context('when signing with another address', () => {
                before('create valid signature but from another validator', async () => {
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
                  const validator1 = await createAllowlistedValidator()
                  const validator2 = await createAllowlistedValidator()
                  ixs = await createSigAndIxs(
                    intentHash,
                    validator1,
                    {},
                    {
                      validatorRegistry: solverSdk.getEntityRegistryKey(
                        EntityType.Validator,
                        hexToBytes(validator2.address)
                      ),
                    }
                  )
                })

                itThrowsAnError('SigVerificationFailedIncorrectValidator')
              })

              context('when signing for another intent', () => {
                before(async () => {
                  const otherHash = generateIntentHash()
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
                  validator = await createAllowlistedValidator()
                  ixs = await createSigAndIxs(
                    otherHash,
                    validator,
                    {},
                    {
                      intent: solverSdk.getIntentKey(intentHash),
                      fulfilledIntent: solverSdk.getFulfilledIntentKey(intentHash),
                    }
                  )
                })

                itThrowsAnError('SigVerificationFailedIncorrectMessage')
              })
            })
          })

          context('when signature is cryptographically invalid', () => {
            before(async () => {
              intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })
              validator = await createAllowlistedValidator()
              ixs = await createSigAndIxs(intentHash, validator, {
                signature: Buffer.from(new Uint8Array(64).fill(0xff)),
              })
            })

            itThrowsAnError('err: InstructionError(0, Custom(2))')
          })
        })

        context('when intent conditions are not met', () => {
          context('when the intent was not executed', () => {
            context('when the intent is final', () => {
              context('when the intent has not expired yet', () => {
                context('when min_validations is already met', async () => {
                  before(async () => {
                    intentHash = await createValidatedIntent(solverSdk, solverProvider, client, {
                      isFinal: true,
                      minValidations: 1,
                    })
                    validator = await createAllowlistedValidator()
                    ixs = await createSigAndIxs()
                  })

                  it('should not add the validator', async () => {
                    const intentBefore = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))
                    const res = await makeTxSignAndSend(solverProvider, ...ixs)
                    const intentAfter = await settler.account.intent.fetch(solverSdk.getIntentKey(intentHash))

                    expect(res.toString()).to.not.include('FailedTransactionMetadata')
                    expect(intentBefore.validators.length).to.be.eq(1)
                    expect(intentAfter.validators.length).to.be.eq(1)
                    expect(intentAfter.validators[0]).to.not.be.deep.eq(ethAddressToByteArray(validator.address))
                  })
                })
              })

              context('when the intent has expired', () => {
                before(async () => {
                  const deadline = getCurrentTimestamp(client, SHORT_DEADLINE)
                  intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true, deadline })
                  validator = await createAllowlistedValidator()
                  ixs = await createSigAndIxs()
                  warpSeconds(solverProvider, WARP_TIME_LONG)
                })

                itThrowsAnError('IntentIsExpired')
              })
            })

            context('when the intent is not final', () => {
              before(async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
                validator = await createAllowlistedValidator()
                ixs = await createSigAndIxs()
              })

              itThrowsAnError('IntentIsNotFinal')
            })
          })

          context('when the intent was already executed', () => {
            context('when fulfilledIntent exists', () => {
              before(async () => {
                intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })

                // Mock FulfilledIntent
                const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
                client.setAccount(fulfilledIntent, {
                  executable: false,
                  lamports: 1002240,
                  owner: settler.programId,
                  data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
                })

                validator = await createAllowlistedValidator()
                ixs = await createSigAndIxs()
              })

              itThrowsAnError(
                'Program log: AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned'
              )
            })
          })
        })
      })

      context('when intent was never created', () => {
        before('generate random intent hash and ixs without sdk', async () => {
          intentHash = generateIntentHash()
          validator = ethers.Wallet.createRandom()
          ixs = await createSigAndIxs(intentHash, validator)
        })

        itThrowsAnError('AnchorError caused by account: intent. Error Code: AccountNotInitialized')
      })
    })

    context('when caller is not whitelisted solver', () => {
      before('create test intent and de-whitelist solver', async () => {
        intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        validator = ethers.Wallet.createRandom()
        ixs = await createSigAndIxs()

        await removeEntityFromAllowlist(controllerSdk, adminProvider, EntityType.Solver, solver.publicKey)
      })

      after('re-whitelist solver', async () => {
        await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Solver, solver.publicKey)
      })

      itThrowsAnError('Program log: AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized')
    })
  })

  describe('add_axia_sig', () => {
    const createAllowlistedAxia = async () => {
      const axia = ethers.Wallet.createRandom()
      await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Axia, hexToBytes(axia.address))
      return axia
    }

    const createTestProposal = async (options?: CreateProposalOptions): Promise<PublicKey> => {
      const params = await createProposalParams(solverSdk, solverProvider, client, options)
      const ix = await solverSdk.createProposalIx(params.intentHash, params)
      await makeTxSignAndSend(solverProvider, ix)
      return solverSdk.getProposalKey(params.intentHash)
    }

    const createSigAndIxs = async (
      proposalKeyOverride: PublicKey = proposalKey,
      ethAxia: ethers.HDNodeWallet = axia,
      secp256k1IxOptions: Partial<CreateSecp256k1InstructionWithEthAddressParams> = {},
      accountsPartial: Partial<{
        proposal: Address
        intent: Address
        axiaRegistry: Address
      }> = {}
    ): Promise<TransactionInstruction[]> => {
      const proposal = await settler.account.proposal.fetch(proposalKeyOverride)
      const intent = await settler.account.intent.fetch(proposal.intent)

      const { signature, recoveryId } = await createAxiaSignature(intent.hash, proposal, ethAxia)

      const eip712Preimage = new ProposalSigner().getMessage(
        solverSdk.anchorProposalToEip712Proposal(proposal, intent.hash),
        { chainId: Chains.Solana, address: settler.programId.toString() }
      )

      const secp256k1Ix = Secp256k1Program.createInstructionWithEthAddress({
        message: hexToBytes(eip712Preimage),
        ethAddress: ethAxia.address,
        signature: Buffer.from(signature),
        recoveryId,
        ...secp256k1IxOptions,
      })

      const ix = await settler.methods
        .addAxiaSig()
        .accountsPartial({
          solver: solverSdk.getSignerKey(),
          solverRegistry: solverSdk.getEntityRegistryKey(EntityType.Solver, solverSdk.getSignerKey()),
          proposal: proposalKeyOverride,
          axiaRegistry: solverSdk.getEntityRegistryKey(EntityType.Axia, hexToBytes(ethAxia.address)),
          ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          ...accountsPartial,
        })
        .instruction()

      return [secp256k1Ix, ix]
    }

    const itThrowsAnError = async (error: string) => {
      it('throws an error', async () => {
        const res = await makeTxSignAndSend(solverProvider, ...ixs)
        expectTransactionError(res.toString(), error)
      })
    }

    let ixs: TransactionInstruction[] = []
    let proposalKey: PublicKey = PublicKey.default
    let axia: ethers.HDNodeWallet

    before('set correct domain', async () => {
      client.expireBlockhash()
      const ix = await adminSdk.updateEip712DomainIx({
        ...SETTLER_EIP712_DOMAIN,
        chainId: Chains.Solana,
      })
      await makeTxSignAndSend(adminProvider, ix)
    })

    context('when caller is whitelisted solver', () => {
      context('when signer is whitelisted axia', () => {
        context('when proposal exists', () => {
          context('when proposal conditions are met', () => {
            context('when signature is cryptographically valid', () => {
              context('when signature is logically valid', () => {
                context('when proposal is unsigned', () => {
                  before(async () => {
                    axia = await createAllowlistedAxia()
                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs()
                  })

                  it('should sign the proposal', async () => {
                    let proposal = await settler.account.proposal.fetch(proposalKey)
                    expect(proposal.isSigned).to.be.false

                    await makeTxSignAndSend(solverProvider, ...ixs)

                    proposal = await settler.account.proposal.fetch(proposalKey)
                    expect(proposal.isSigned).to.be.true
                  })
                })

                context('when proposal is already signed', () => {
                  before(async () => {
                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs()
                    await makeTxSignAndSend(solverProvider, ...ixs)
                    client.expireBlockhash()
                  })

                  it('should not sign the proposal twice (idempotent ix)', async () => {
                    let proposal = await settler.account.proposal.fetch(proposalKey)
                    expect(proposal.isSigned).to.be.true

                    const res = await makeTxSignAndSend(solverProvider, ...ixs)

                    proposal = await settler.account.proposal.fetch(proposalKey)
                    expect(proposal.isSigned).to.be.true
                    expect(res.toString()).to.not.include('FailedTransactionMetadata')
                  })
                })
              })

              context('when signature is logically invalid', () => {
                context('when domain does not match', () => {
                  before(async () => {
                    client.expireBlockhash()
                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs(undefined, undefined, undefined, {
                      proposal: await createTestProposal(),
                    })
                    const ix = await adminSdk.updateEip712DomainIx({ name: 'Other Domain' })
                    await makeTxSignAndSend(adminProvider, ix)
                  })

                  after(async () => {
                    client.expireBlockhash()
                    const ix = await adminSdk.updateEip712DomainIx({
                      ...SETTLER_EIP712_DOMAIN,
                      chainId: Chains.Solana,
                    })
                    await makeTxSignAndSend(adminProvider, ix)
                  })

                  itThrowsAnError('SigVerificationFailedIncorrectMessage')
                })

                context('when signing for another proposal', () => {
                  before(async () => {
                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs(undefined, undefined, undefined, {
                      proposal: await createTestProposal(),
                    })
                  })

                  itThrowsAnError('SigVerificationFailedIncorrectMessage')
                })

                context('when signing with another allowlisted axia key', () => {
                  before(async () => {
                    const otherAxia = await createAllowlistedAxia()
                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs(undefined, undefined, undefined, {
                      axiaRegistry: controllerSdk.getEntityRegistryPubkey(
                        EntityType.Axia,
                        hexToBytes(otherAxia.address)
                      ),
                    })
                  })

                  itThrowsAnError('SigVerificationFailedIncorrectAxia')
                })

                context('when signing with an allowlisted validator key', () => {
                  before(async () => {
                    const validator = ethers.Wallet.createRandom()
                    await createAllowlistedEntity(
                      controllerSdk,
                      adminProvider,
                      EntityType.Validator,
                      hexToBytes(validator.address)
                    )

                    proposalKey = await createTestProposal()
                    ixs = await createSigAndIxs(undefined, validator, undefined, {
                      axiaRegistry: controllerSdk.getEntityRegistryPubkey(
                        EntityType.Axia,
                        hexToBytes(validator.address)
                      ),
                    })
                  })

                  itThrowsAnError('AnchorError caused by account: axia_registry. Error Code: AccountNotInitialized')
                })

                context('when signing another message', () => {
                  before('create personal signature', async () => {
                    proposalKey = await createTestProposal()

                    const message = hexToBytes(ethers.keccak256(hexToBytes('0xdeadbeef')))
                    const fullSignature = await axia.signMessage(message)
                    const fullSigBytes = ethers.getBytes(fullSignature)

                    const signature = Array.from(fullSigBytes.slice(0, 64))
                    const recoveryId = fullSigBytes[64] - 27

                    const prefix = Buffer.from('\x19Ethereum Signed Message:\n32', 'utf8')
                    const prefixedMessage = Buffer.concat([prefix, message])

                    ixs = await createSigAndIxs(undefined, undefined, {
                      message: prefixedMessage,
                      signature,
                      recoveryId,
                    })
                  })

                  itThrowsAnError('SigVerificationFailedIncorrectMessage')
                })
              })
            })

            context('when signature is not cryptographically valid', () => {
              before(async () => {
                proposalKey = await createTestProposal()
                ixs = await createSigAndIxs(undefined, undefined, {
                  signature: Buffer.from(new Uint8Array(64).fill(0xff)),
                })
              })

              itThrowsAnError('err: InstructionError(0, Custom(2))')
            })
          })

          context('when proposal conditions are not met', () => {
            context('when the proposal is final', () => {
              context('when the proposal deadline is in the past', () => {
                before('create proposal and warp until it has expired', async () => {
                  proposalKey = await createTestProposal({
                    proposalParams: { isFinal: true, deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
                  })
                  ixs = await createSigAndIxs()
                  warpSeconds(adminProvider, WARP_TIME_LONG)
                })

                itThrowsAnError('ProposalIsExpired')
              })

              context('when the proposal deadline equals now', () => {
                before('create proposal and warp until it has expired', async () => {
                  proposalKey = await createTestProposal({
                    proposalParams: { isFinal: true, deadline: getCurrentTimestamp(client, SHORT_DEADLINE) },
                  })
                  ixs = await createSigAndIxs()
                  warpSeconds(adminProvider, WARP_TIME_SHORT)
                })

                itThrowsAnError('ProposalIsExpired')
              })
            })

            context('when the proposal is not final', () => {
              before('create proposal and warp until it has expired', async () => {
                proposalKey = await createTestProposal({
                  proposalParams: { isFinal: false },
                })
                ixs = await createSigAndIxs()
              })

              itThrowsAnError('ProposalIsNotFinal')
            })
          })
        })

        context('when proposal does not exist', () => {
          before(async () => {
            ixs = await createSigAndIxs(undefined, undefined, undefined, {
              proposal: randomPubkey(),
              intent: randomPubkey(),
            })
          })

          itThrowsAnError('AnchorError caused by account: proposal. Error Code: AccountNotInitialized')
        })
      })

      context('when signer is not whitelisted axia', () => {
        before('create objects and de-whitelist axia', async () => {
          proposalKey = await createTestProposal()
          ixs = await createSigAndIxs()
          await removeEntityFromAllowlist(controllerSdk, adminProvider, EntityType.Axia, hexToBytes(axia.address))
        })

        itThrowsAnError('AnchorError caused by account: axia_registry. Error Code: AccountNotInitialized')
      })
    })

    context('when caller is not whitelisted solver', () => {
      before('create objects and de-whitelist solver', async () => {
        proposalKey = await createTestProposal()
        ixs = await createSigAndIxs()
        await removeEntityFromAllowlist(controllerSdk, adminProvider, EntityType.Solver, solver.publicKey)
      })

      after('re-whitelist solver', async () => {
        await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Solver, solver.publicKey)
      })

      itThrowsAnError('AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized')
    })
  })

  describe('execute_proposal', () => {
    let ix: TransactionInstruction
    let intentHash: string
    let intent: Intent
    let proposal: Proposal
    let remainingAccounts: AccountMeta[]

    let usdc: web3.PublicKey

    let user: Keypair
    let recipient: web3.PublicKey

    let userProvider: LiteSVMProvider

    let userAta: web3.PublicKey
    let recipientAta: web3.PublicKey

    const validator = ethers.Wallet.createRandom()
    const axia = ethers.Wallet.createRandom()

    const createIx = async (
      sdk: SvmSettler,
      accountsPartial: Partial<{
        solver: web3.PublicKey
        proposalCreator: web3.PublicKey
        proposal: web3.PublicKey
        intentCreator: web3.PublicKey
        intent: web3.PublicKey
        fulfilledIntent: web3.PublicKey
        delegate: web3.PublicKey
      }> = {}
    ) => {
      const ix = await settler.methods
        .executeProposal()
        .accountsPartial({
          solver: sdk.getSignerKey(),
          solverRegistry: sdk.getEntityRegistryKey(EntityType.Solver, sdk.getSignerKey()),
          proposalCreator: translateAddress(proposal.solver),
          proposal: sdk.getProposalKey(intentHash, proposal.solver),
          intentCreator: proposal.solver,
          intent: sdk.getIntentKey(intentHash),
          fulfilledIntent: sdk.getFulfilledIntentKey(intentHash),
          delegate: sdk.getDelegateKey(intent.user),
          ...accountsPartial,
        })
        .remainingAccounts(remainingAccounts)
        .instruction()
      return ix
    }

    const itThrowsAnError = async (error: string) => {
      it('throws an error', async () => {
        const res = await makeTxSignAndSend(solverProvider, ix)
        expectTransactionError(res.toString(), error)
      })
    }

    const createTestIntent = (data: string): Intent => ({
      configSig: randomHex(32),
      data,
      deadline: (Number(client.getClock().unixTimestamp) + 1000).toString(),
      events: [{ topic: randomHex(32), data: randomHex(50) }],
      maxFees: [{ token: usdc.toString(), amount: '10000000' }],
      minValidations: 1,
      nonce: randomHex(32),
      op: 1,
      settler: settler.programId.toString(),
      user: user.publicKey.toString(),
    })

    const createTestProposal = (
      intent: Intent,
      data = '0x',
      solver: PublicKey = solverSdk.getSignerKey()
    ): Proposal => ({
      data,
      deadline: intent.deadline,
      fees: intent.maxFees.map((mf) => mf.amount),
      solver: solver.toString(),
    })

    const totalTransferAmount = (transfers: TransferIntentData['transfers']) =>
      transfers.reduce((prev, curr) => prev + Number(curr.amount), 0)

    const totalFees = (fees: string[]) => fees.reduce((prev, curr) => prev + Number(curr), 0)

    const prepareIntentAndProposal = async (sdk: SvmSettler = solverSdk) => {
      await makeTxSignAndSend(solverProvider, await sdk.createIntentIx(intentHash, intent, true))

      const validatorSig = await new ValidatorSigner(EthersSigner.fromPrivateKey(validator.privateKey)).signIntentHash({
        hash: intentHash,
        settler: '',
        chainId: Chains.Solana,
      })

      await makeTxSignAndSend(
        solverProvider,
        ...(await sdk.addValidatorSigIxs(intentHash, validator.address, validatorSig))
      )

      await makeTxSignAndSend(
        solverProvider,
        await sdk.createProposalIx(intentHash, {
          instructions: [],
          ...proposal,
          isFinal: true,
        })
      )

      const axiaSig = await new ProposalSigner(EthersSigner.fromPrivateKey(axia.privateKey)).signProposal(
        { ...proposal, intent: intentHash },
        {
          address: settler.programId.toString(),
          chainId: Chains.Solana,
        }
      )

      await makeTxSignAndSend(solverProvider, ...(await sdk.addAxiaSigIxs(intentHash, proposal, axia.address, axiaSig)))
    }

    before('set correct domain', async () => {
      client.expireBlockhash()
      const ix = await adminSdk.updateEip712DomainIx({
        ...SETTLER_EIP712_DOMAIN,
        chainId: Chains.Solana,
      })
      await makeTxSignAndSend(adminProvider, ix)
    })

    before('Create validator, Axia, USDC, USDT and fund user', async () => {
      user = randomKeypair()
      recipient = randomPubkey()
      userProvider = new LiteSVMProvider(client, new Wallet(user))

      adminProvider.client.airdrop(user.publicKey, toLamports(100))

      await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Validator, hexToBytes(validator.address))
      await createAllowlistedEntity(controllerSdk, adminProvider, EntityType.Axia, hexToBytes(axia.address))

      usdc = createMint(client, admin, { decimals: 9, freezeAuthority: null }).mint

      userAta = (await createFundedAta(adminProvider, admin, user.publicKey, usdc, 100_000_000_000)).ata
      recipientAta = (await createFundedAta(adminProvider, admin, recipient, usdc, 0)).ata
      await createFundedAta(adminProvider, admin, solver.publicKey, usdc, 0)
    })

    context('when intent is transfer', () => {
      let transfers: TransferIntentData['transfers']
      let testIntentData: TransferIntentData

      const createTestTransfers = (n: number) =>
        Array.from({ length: n }, () => ({
          amount: '1000000000',
          token: usdc.toString(),
          recipient: recipient.toString(),
        }))

      const createTestIntentData = (transfers?: TransferIntentData['transfers']): TransferIntentData => ({
        chainId: Chains.Solana,
        transfers: transfers ?? [],
      })

      const getRemainingAccounts = (intent: Intent, proposal: Proposal): AccountMeta[] => {
        const decodedIntent = svmDecodeTransferIntent(intent)
        const { transfers } = decodedIntent

        const tokenProgram: AccountMeta = { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
        const token2022Program: AccountMeta = { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }

        const transferAccounts = transfers.flatMap((transfer) => [
          { pubkey: translateAddress(transfer.token), isSigner: false, isWritable: false },
          { pubkey: translateAddress(transfer.recipient), isSigner: false, isWritable: false },
          { pubkey: recipientAta, isSigner: false, isWritable: true },
          { pubkey: userAta, isSigner: false, isWritable: true },
        ])

        const solverFeeAccounts = intent.maxFees.flatMap((maxFee) => {
          const feeToken = translateAddress(maxFee.token)
          const solverAta = getAssociatedTokenAddressSync(feeToken, translateAddress(proposal.solver))
          const userAta = getAssociatedTokenAddressSync(feeToken, translateAddress(intent.user))

          return [
            { pubkey: feeToken, isSigner: false, isWritable: false },
            { pubkey: solverAta, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
          ]
        })

        return [tokenProgram, token2022Program, ...transferAccounts, ...solverFeeAccounts]
      }

      const editProposal = async (proposalKey: web3.PublicKey, editedProposal: Partial<ProposalAccount>) => {
        const proposalAccount = await settler.account.proposal.fetch(proposalKey)
        const proposalInfo = client.getAccount(proposalKey)!

        const modifiedProposal = {
          ...proposalAccount,
          ...editedProposal,
        }

        const serializedProposal = await settler.coder.accounts.encode('proposal', modifiedProposal)

        client.setAccount(proposalKey, {
          ...proposalInfo,
          data: serializedProposal,
        })
      }

      const itWorksAsExpected = (n: number) => {
        context('when remaining accounts are correct', () => {
          context('when transfer/s is/are valid', () => {
            context('when protocol has approval', () => {
              context('when user has sufficient funds', () => {
                beforeEach('Create data and approve delegate', async () => {
                  transfers = createTestTransfers(n)
                  testIntentData = createTestIntentData(transfers)
                  intentHash = randomHex(32)
                  intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                  proposal = createTestProposal(intent)
                  remainingAccounts = getRemainingAccounts(intent, proposal)

                  await approveDelegate(
                    userProvider,
                    userAta,
                    solverSdk.getDelegateKey(user.publicKey),
                    user,
                    totalTransferAmount(transfers) + totalFees(proposal.fees)
                  )

                  await prepareIntentAndProposal()

                  ix = await createIx(solverSdk)
                })

                it('executes transfer', async () => {
                  const solverAta = getAssociatedTokenAddressSync(usdc, solver.publicKey)
                  const proposalKey = sdk.getProposalKey(intentHash, proposal.solver)
                  const intentKey = sdk.getIntentKey(intentHash)
                  const fulfilledIntentKey = sdk.getFulfilledIntentKey(intentHash)

                  const proposalBalanceBefore = Number(adminProvider.client.getBalance(proposalKey)) || 0
                  const intentBalanceBefore = Number(adminProvider.client.getBalance(intentKey)) || 0
                  const solverBalanceBefore =
                    Number(adminProvider.client.getBalance(translateAddress(proposal.solver))) || 0

                  const recipientBalanceBefore = getAtaBalance(client, recipientAta)
                  const userBalanceBefore = getAtaBalance(client, userAta)
                  const solverAtaBalanceBefore = getAtaBalance(client, solverAta)

                  await makeTxSignAndSend(solverProvider, ix)

                  const recipientBalanceAfter = getAtaBalance(client, recipientAta)
                  const userBalanceAfter = getAtaBalance(client, userAta)
                  const solverAtaBalanceAfter = getAtaBalance(client, solverAta)

                  const proposalBalanceAfter = Number(adminProvider.client.getBalance(proposalKey)) || 0
                  const intentBalanceAfter = Number(adminProvider.client.getBalance(intentKey)) || 0
                  const solverBalanceAfter =
                    Number(adminProvider.client.getBalance(translateAddress(proposal.solver))) || 0
                  const fulfilledIntentBalanceAfter = Number(adminProvider.client.getBalance(fulfilledIntentKey)) || 0

                  try {
                    await settler.account.intent.fetch(intentKey)
                    expect.fail('Intent account should be closed')
                  } catch (error: any) {
                    expect(error.message).to.include('Account does not exist')
                  }

                  try {
                    await settler.account.proposal.fetch(proposalKey)
                    expect.fail('Proposal account should be closed')
                  } catch (error: any) {
                    expect(error.message).to.include('Account does not exist')
                  }

                  const transfersAmount = totalTransferAmount(transfers)
                  const feesAmount = totalFees(proposal.fees)

                  expect(client.getAccount(fulfilledIntentKey)?.owner.toString()).to.be.eq(settler.programId.toString())
                  expect(recipientBalanceAfter).to.be.eq(recipientBalanceBefore + transfersAmount)
                  expect(userBalanceAfter).to.be.eq(userBalanceBefore - transfersAmount - feesAmount)
                  expect(solverBalanceAfter).to.be.eq(
                    solverBalanceBefore +
                      intentBalanceBefore +
                      proposalBalanceBefore -
                      fulfilledIntentBalanceAfter -
                      5000
                  )
                  expect(proposalBalanceAfter).to.be.eq(0)
                  expect(intentBalanceAfter).to.be.eq(0)
                  expect(solverAtaBalanceAfter).to.be.eq(solverAtaBalanceBefore + feesAmount)
                })
              })

              context('when user does not have sufficient funds', () => {
                context('when user does not have transfer token sufficient funds', () => {
                  beforeEach('Create data and approve delegate', async () => {
                    transfers = [
                      {
                        amount: '1000000000000',
                        token: usdc.toString(),
                        recipient: recipient.toString(),
                      },
                    ]

                    await approveDelegate(
                      userProvider,
                      userAta,
                      solverSdk.getDelegateKey(user.publicKey),
                      user,
                      Number(transfers[0].amount)
                    )

                    testIntentData = createTestIntentData(transfers)
                    intentHash = randomHex(32)
                    intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                    proposal = createTestProposal(intent)
                    remainingAccounts = getRemainingAccounts(intent, proposal)

                    await prepareIntentAndProposal()

                    ix = await createIx(solverSdk)
                  })

                  itThrowsAnError('insufficient funds')
                })

                context('when user does not have fee token/s sufficient funds', () => {
                  beforeEach('Create data with new token for fees', async () => {
                    const usdt = createMint(client, admin, { decimals: 9, freezeAuthority: null }).mint
                    const usdtUserAta = (await createFundedAta(adminProvider, admin, user.publicKey, usdt, 0)).ata
                    await createFundedAta(adminProvider, admin, solver.publicKey, usdt, 0)

                    transfers = createTestTransfers(n)
                    testIntentData = createTestIntentData(transfers)
                    intentHash = randomHex(32)
                    intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                    intent = { ...intent, maxFees: [{ token: usdt.toString(), amount: '10000000' }] }
                    proposal = createTestProposal(intent)
                    remainingAccounts = getRemainingAccounts(intent, proposal)

                    await approveDelegate(
                      userProvider,
                      userAta,
                      solverSdk.getDelegateKey(user.publicKey),
                      user,
                      totalTransferAmount(transfers)
                    )

                    await approveDelegate(
                      userProvider,
                      usdtUserAta,
                      solverSdk.getDelegateKey(user.publicKey),
                      user,
                      totalFees(proposal.fees)
                    )

                    await prepareIntentAndProposal()

                    ix = await createIx(solverSdk)
                  })

                  itThrowsAnError('insufficient funds')
                })
              })
            })

            context('when protocol does not have approval', () => {
              context('when protocol does not have transfer token approval', () => {
                beforeEach('Create data and remove delegate', async () => {
                  await revokeDelegate(userProvider, userAta, user)

                  transfers = createTestTransfers(n)
                  testIntentData = createTestIntentData(transfers)
                  intentHash = randomHex(32)
                  intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                  proposal = createTestProposal(intent)
                  remainingAccounts = getRemainingAccounts(intent, proposal)

                  await prepareIntentAndProposal()

                  ix = await createIx(solverSdk)
                })

                itThrowsAnError('owner does not match')
              })

              context('when protocol does not have fee token/s approval', () => {
                beforeEach('Create data, new fee token mint, approve Delegate for transfer token only', async () => {
                  const usdt = createMint(client, admin, { decimals: 9, freezeAuthority: null }).mint
                  await createFundedAta(adminProvider, admin, user.publicKey, usdt, 100_000_000_000)
                  await createFundedAta(adminProvider, admin, solver.publicKey, usdt, 0)

                  transfers = createTestTransfers(n)
                  testIntentData = createTestIntentData(transfers)
                  intentHash = randomHex(32)
                  intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                  intent = { ...intent, maxFees: [{ token: usdt.toString(), amount: '100000' }] }
                  proposal = createTestProposal(intent)
                  remainingAccounts = getRemainingAccounts(intent, proposal)

                  await approveDelegate(
                    userProvider,
                    userAta,
                    solverSdk.getDelegateKey(user.publicKey),
                    user,
                    totalTransferAmount(transfers) + totalFees(proposal.fees)
                  )

                  await prepareIntentAndProposal()

                  ix = await createIx(solverSdk)
                })

                itThrowsAnError('owner does not match')
              })
            })
          })

          context('when proposal is not valid', () => {
            context('when proposal intent is not for chain Solana', () => {
              beforeEach('Create data for Optimism', async () => {
                transfers = createTestTransfers(n)
                testIntentData = { ...createTestIntentData(transfers), chainId: Chains.Optimism }
                intentHash = randomHex(32)
                intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                proposal = createTestProposal(intent)
                remainingAccounts = getRemainingAccounts(intent, proposal)

                await prepareIntentAndProposal()

                ix = await createIx(solverSdk)
              })

              itThrowsAnError('Incorrect intent chain id')
            })

            context('when proposal has data/instructions', () => {
              beforeEach('Create Proposal and manually edit bytes to add data on-chain', async () => {
                transfers = createTestTransfers(n)
                testIntentData = createTestIntentData(transfers)
                intentHash = randomHex(32)
                intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                proposal = createTestProposal(intent)
                remainingAccounts = getRemainingAccounts(intent, proposal)

                await prepareIntentAndProposal()
                await editProposal(solverSdk.getProposalKey(intentHash, proposal.solver), {
                  instructions: [
                    {
                      programId: randomPubkey(),
                      accounts: [],
                      data: Buffer.from('deadbeef', 'hex'),
                    },
                  ],
                })

                ix = await createIx(solverSdk)
              })

              itThrowsAnError('Incorrect proposal data')
            })
          })
        })

        context('when remaining accounts are not correct', () => {
          beforeEach('Set up base data and re-approve', async () => {
            transfers = createTestTransfers(n)
            testIntentData = createTestIntentData(transfers)
            intentHash = randomHex(32)
            intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
            proposal = createTestProposal(intent)
            remainingAccounts = getRemainingAccounts(intent, proposal)

            // Re-approve Delegate for test
            await approveDelegate(
              userProvider,
              userAta,
              solverSdk.getDelegateKey(user.publicKey),
              user,
              totalTransferAmount(transfers) + totalFees(proposal.fees)
            )
          })

          context('when remaining accounts number is correct', () => {
            context('when token programs are passed correctly', () => {
              context('when transfer accounts are incorrect', () => {
                context('when token is incorrect', () => {
                  beforeEach(async () => {
                    remainingAccounts[2].pubkey = createMint(client, admin).mint
                    await prepareIntentAndProposal()
                    ix = await createIx(solverSdk)
                  })

                  itThrowsAnError('Incorrect transfer token mint account')
                })

                context('when recipient is incorrect', () => {
                  beforeEach(async () => {
                    remainingAccounts[3].pubkey = randomPubkey()
                    await prepareIntentAndProposal()
                    ix = await createIx(solverSdk)
                  })

                  itThrowsAnError('Incorrect transfer recipient account')
                })

                context('when recipient token account is incorrect', () => {
                  context('when authority is incorrect', () => {
                    beforeEach(async () => {
                      remainingAccounts[4].pubkey = userAta
                      await prepareIntentAndProposal()
                      ix = await createIx(solverSdk)
                    })

                    itThrowsAnError('Incorrect recipient token account: mint or authority do not match expected')
                  })

                  context('when token mint is incorrect', () => {
                    beforeEach(async () => {
                      remainingAccounts[4].pubkey = (
                        await createFundedAta(adminProvider, admin, recipient, createMint(client, admin).mint, 0)
                      ).ata

                      await prepareIntentAndProposal()
                      ix = await createIx(solverSdk)
                    })

                    itThrowsAnError('Incorrect recipient token account: mint or authority do not match expected')
                  })
                })

                context('when user token account is incorrect', () => {
                  context('when authority is incorrect', () => {
                    beforeEach(async () => {
                      remainingAccounts[5].pubkey = recipientAta
                      await prepareIntentAndProposal()
                      ix = await createIx(solverSdk)
                    })

                    itThrowsAnError('Incorrect user token account: mint or authority do not match expected')
                  })

                  context('when token mint is incorrect', () => {
                    beforeEach(async () => {
                      remainingAccounts[5].pubkey = (
                        await createFundedAta(adminProvider, admin, user.publicKey, createMint(client, admin).mint, 0)
                      ).ata

                      await prepareIntentAndProposal()
                      ix = await createIx(solverSdk)
                    })

                    itThrowsAnError('Incorrect user token account: mint or authority do not match expected')
                  })
                })
              })

              context('when transfer accounts are correct', () => {
                context('when fee accounts are incorrect', () => {
                  context('when token is incorrect', () => {
                    context('when token is another token', () => {
                      beforeEach(async () => {
                        remainingAccounts[remainingAccounts.length - 3].pubkey = createMint(client, admin).mint
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Incorrect fee token mint account')
                    })

                    context('when token is another type of account', () => {
                      beforeEach(async () => {
                        remainingAccounts[remainingAccounts.length - 3].pubkey = randomPubkey()
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Account not owned by TokenKeg or Token2022 programs')
                    })
                  })

                  context('when solver token account is incorrect', () => {
                    context('when solver token account is another token account', () => {
                      beforeEach(async () => {
                        const otherAta = await createFundedAta(adminProvider, admin, randomPubkey(), usdc, 0)
                        remainingAccounts[remainingAccounts.length - 2].pubkey = otherAta.ata
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Incorrect solver token account: mint or authority do not match expected')
                    })

                    context('when solver token account is another type of account', () => {
                      beforeEach(async () => {
                        remainingAccounts[remainingAccounts.length - 2].pubkey = randomPubkey()
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Account not owned by TokenKeg or Token2022 programs')
                    })
                  })

                  context('when user token account is incorrect', () => {
                    context('when user token account is another token account', () => {
                      beforeEach(async () => {
                        const otherAta = await createFundedAta(adminProvider, admin, randomPubkey(), usdc, 0)
                        remainingAccounts[remainingAccounts.length - 1].pubkey = otherAta.ata
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Incorrect user token account: mint or authority do not match expected')
                    })

                    context('when user token account is another type of account', () => {
                      beforeEach(async () => {
                        remainingAccounts[remainingAccounts.length - 1].pubkey = randomPubkey()
                        await prepareIntentAndProposal()
                        ix = await createIx(solverSdk)
                      })

                      itThrowsAnError('Account not owned by TokenKeg or Token2022 programs')
                    })
                  })
                })
              })
            })

            context('when token programs are not passed correctly', () => {
              context('when first program is wrong', () => {
                beforeEach(async () => {
                  remainingAccounts[0].pubkey = randomPubkey()
                  await prepareIntentAndProposal()
                  ix = await createIx(solverSdk)
                })

                itThrowsAnError('Incorrect token program account')
              })

              context('when second program is wrong', () => {
                beforeEach(async () => {
                  remainingAccounts[1].pubkey = randomPubkey()
                  await prepareIntentAndProposal()
                  ix = await createIx(solverSdk)
                })

                itThrowsAnError('Incorrect token program account')
              })

              context('when both programs are wrong', () => {
                beforeEach(async () => {
                  remainingAccounts[0].pubkey = randomPubkey()
                  remainingAccounts[1].pubkey = randomPubkey()
                  await prepareIntentAndProposal()
                  ix = await createIx(solverSdk)
                })

                itThrowsAnError('Incorrect token program account')
              })
            })
          })

          context('when remaining accounts number is not correct', () => {
            context('when there are less remaining accounts than expected', () => {
              beforeEach(async () => {
                remainingAccounts.pop()
                await prepareIntentAndProposal()
                ix = await createIx(solverSdk)
              })

              itThrowsAnError('ProgramError')
            })

            context('when there are more remaining accounts than expected', () => {
              beforeEach(async () => {
                remainingAccounts.push({ pubkey: randomPubkey(), isWritable: true, isSigner: false })
                await prepareIntentAndProposal()
                ix = await createIx(solverSdk)
              })

              it('works normally', async () => {
                const res = await makeTxSignAndSend(solverProvider, ix)
                expect(res.toString()).not.to.include('FailedTransactionMetadata')
              })
            })
          })
        })
      }

      context('when caller is allowlisted solver', () => {
        context('when intent exists', () => {
          context('when intent is correct', () => {
            context('when proposal exists', () => {
              context('when proposal is correct', () => {
                context('when intent has one transfer', () => {
                  itWorksAsExpected(1)
                })

                context('when intent has more than one transfer', () => {
                  itWorksAsExpected(2)
                })
              })

              context('when proposal is not correct', () => {
                beforeEach('Setup base data', async () => {
                  transfers = createTestTransfers(1)
                  testIntentData = createTestIntentData(transfers)
                  intentHash = randomHex(32)
                  intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                  proposal = createTestProposal(intent)
                  remainingAccounts = getRemainingAccounts(intent, proposal)
                })

                context('when proposal is for another intent', () => {
                  beforeEach(async () => {
                    const otherIntentHash = randomHex(32)
                    const otherIntent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                    const otherIntentKey = solverSdk.getIntentKey(otherIntentHash)
                    const otherFulfilledIntentKey = solverSdk.getFulfilledIntentKey(otherIntentHash)
                    await makeTxSignAndSend(
                      solverProvider,
                      await solverSdk.createIntentIx(otherIntentHash, otherIntent, true)
                    )

                    await prepareIntentAndProposal()
                    ix = await createIx(solverSdk, { intent: otherIntentKey, fulfilledIntent: otherFulfilledIntentKey })
                  })

                  itThrowsAnError('Incorrect intent for proposal')
                })

                context('when proposal is from another proposal creator', () => {
                  beforeEach(async () => {
                    await prepareIntentAndProposal()
                    ix = await createIx(solverSdk, { proposalCreator: randomPubkey() })
                  })

                  itThrowsAnError('Incorrect proposal creator')
                })

                context('when proposal is not signed', () => {
                  beforeEach(async () => {
                    await prepareIntentAndProposal()
                    await editProposal(solverSdk.getProposalKey(intentHash, proposal.solver), { isSigned: false })
                    ix = await createIx(solverSdk)
                  })

                  itThrowsAnError('Proposal is not signed')
                })

                context('when proposal is expired', () => {
                  beforeEach(async () => {
                    await prepareIntentAndProposal()
                    ix = await createIx(solverSdk)

                    const delta = Number(proposal.deadline) - Number(client.getClock().unixTimestamp)
                    warpSeconds(solverProvider, delta * 2)
                  })

                  itThrowsAnError('Proposal has already expired')
                })
              })
            })
          })

          context('when intent is not correct', () => {
            context('when intent_creator is not correct', () => {
              beforeEach(async () => {
                transfers = createTestTransfers(1)
                testIntentData = createTestIntentData(transfers)
                intentHash = randomHex(32)
                intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
                proposal = createTestProposal(intent)
                remainingAccounts = getRemainingAccounts(intent, proposal)

                await prepareIntentAndProposal()
                ix = await createIx(solverSdk, { intentCreator: randomPubkey() })
              })

              itThrowsAnError('Incorrect intent creator')
            })
          })
        })
      })

      context('when caller is not allowlisted solver', () => {
        beforeEach(async () => {
          transfers = createTestTransfers(1)
          testIntentData = createTestIntentData(transfers)
          intentHash = randomHex(32)
          intent = createTestIntent(svmEncodeTransferIntent(testIntentData))
          proposal = createTestProposal(intent)
          remainingAccounts = getRemainingAccounts(intent, proposal)

          await prepareIntentAndProposal()
          ix = await createIx(maliciousSdk)
        })

        it('throws an error', async () => {
          const res = await makeTxSignAndSend(maliciousProvider, ix)
          expect(res.toString()).to.include(
            'AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized'
          )
        })
      })
    })

    context('when intent is not transfer', () => {
      beforeEach(async () => {
        intentHash = randomHex(32)
        intent = { ...createTestIntent('0xdeadbeef'), op: 2 }
        proposal = createTestProposal(intent)

        await prepareIntentAndProposal()
        ix = await createIx(solverSdk)
      })

      it('throws an error', async () => {
        const res = await makeTxSignAndSend(solverProvider, ix)
        expect(res.toString()).to.include('Unsupported intent op')
      })
    })
  })
})
