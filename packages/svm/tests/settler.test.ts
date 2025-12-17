/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import SettlerSDK from '../sdks/settler/Settler'
import { OpType } from '../sdks/settler/types'
import WhitelistSDK, { EntityType, WhitelistStatus } from '../sdks/whitelist/Whitelist'
import * as SettlerIDL from '../target/idl/settler.json'
import * as WhitelistIDL from '../target/idl/whitelist.json'
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
  WARP_TIME_LONG,
  WARP_TIME_SHORT,
} from './helpers/constants'
import {
  createTestIntent,
  createValidatedIntent,
  expectTransactionError,
  generateIntentHash,
  generateNonce,
} from './helpers/settler-helpers'
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

  let whitelistSdk: WhitelistSDK

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

    // Initialize Whitelist and whitelist Solver
    whitelistSdk = new WhitelistSDK(provider)
    await makeTxSignAndSend(provider, await whitelistSdk.initializeIx(admin.publicKey, 1))
    await makeTxSignAndSend(
      provider,
      await whitelistSdk.setEntityWhitelistStatusIx(EntityType.Solver, solver.publicKey, WhitelistStatus.Whitelisted)
    )
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('Settler', () => {
    describe('initialize', () => {
      it('cannot initialize if not deployer', async () => {
        const ix = await maliciousSdk.initializeIx()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, 'Only Deployer can call this instruction.')
      })

      it('should call initialize', async () => {
        const ix = await sdk.initializeIx()
        await makeTxSignAndSend(provider, ix)

        const settings = await program.account.settlerSettings.fetch(sdk.getSettlerSettingsPubkey())
        expect(settings.whitelistProgram.toString()).to.be.eq(WhitelistIDL.address)
        expect(settings.isPaused).to.be.false
      })

      it('cannot call initialize again', async () => {
        const ix = await sdk.initializeIx()
        const res = await makeTxSignAndSend(provider, ix)

        expectTransactionError(res, 'already in use')
      })
    })

    describe('create_intent', () => {
      it('should create an intent', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [
            {
              topicHex: DEFAULT_TOPIC_HEX,
              dataHex: DEFAULT_EVENT_DATA_HEX,
            },
          ],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.op).to.deep.include({ transfer: {} })
        expect(intent.user.toString()).to.be.eq(user.toString())
        expect(intent.intentCreator.toString()).to.be.eq(solver.publicKey.toString())
        expect(Buffer.from(intent.nonce).toString('hex')).to.be.eq(nonce)
        expect(intent.deadline.toNumber()).to.be.eq(deadline)
        expect(intent.minValidations).to.be.eq(DEFAULT_MIN_VALIDATIONS)
        expect(intent.validations).to.be.eq(0)
        expect(intent.isFinal).to.be.false
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq(DEFAULT_DATA_HEX)
        expect(intent.maxFees.length).to.be.eq(1)
        expect(intent.maxFees[0].mint.toString()).to.be.eq(params.maxFees[0].mint.toString())
        expect(intent.maxFees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE)
        expect(intent.events.length).to.be.eq(1)
        expect(intent.validators.length).to.be.eq(0)
        expect(Buffer.from(intent.events[0].topic).toString('hex')).to.be.eq(params.eventsHex[0].topicHex)
        expect(Buffer.from(intent.events[0].data).toString('hex')).to.be.eq(DEFAULT_EVENT_DATA_HEX)
      })

      it('should create an intent with empty data', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
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

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.op).to.deep.include({ swap: {} })
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq(EMPTY_DATA_HEX)
        expect(intent.isFinal).to.be.true
      })

      it('cannot create an intent with empty max_fees', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Call,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: MULTIPLE_MIN_VALIDATIONS,
          dataHex: TEST_DATA_HEX_1,
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'No max fees provided')
      })

      it('should create an intent with empty events', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          dataHex: TEST_DATA_HEX_2,
          eventsHex: [],
        })

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.events.length).to.be.eq(0)
      })

      it('should create an intent with is_final true', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          dataHex: EMPTY_DATA_HEX,
          eventsHex: [],
          isFinal: true,
        })

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.true
      })

      it('should create an intent with is_final false', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          dataHex: EMPTY_DATA_HEX,
          eventsHex: [],
          isFinal: false,
        })

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.false
      })

      it('cannot create intent if not whitelisted solver', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await maliciousSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')

        const intent = client.getAccount(sdk.getIntentKey(intentHash))
        expect(intent).to.be.null
      })

      it('cannot create intent with deadline in the past', async () => {
        warpSeconds(provider, WARP_TIME_LONG)

        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now - SHORT_DEADLINE

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'Deadline must be in the future')
      })

      it('cannot create intent with deadline equal to now', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'Deadline must be in the future')
      })

      it('cannot create intent if fulfilled_intent PDA already exists', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        // Mock FulfilledIntent
        const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
        client.setAccount(fulfilledIntent, {
          executable: false,
          lamports: 1002240,
          owner: program.programId,
          data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
        })

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'AccountNotSystemOwned')
      })

      it('cannot create intent with same intent_hash twice', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          isFinal: false,
        })

        client.expireBlockhash()
        const params = {
          op: OpType.Transfer,
          user: Keypair.generate().publicKey,
          nonceHex: generateNonce(),
          deadline: Number(client.getClock().unixTimestamp) + INTENT_DEADLINE_OFFSET,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }
        const ix2 = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, 'already in use')
      })

      it('cannot create intent with invalid intent_hash', async () => {
        const invalidIntentHash = '123456'
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: EMPTY_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        try {
          const ix = await solverSdk.createIntentIx(invalidIntentHash, params, false)
          await makeTxSignAndSend(solverProvider, ix)
          expect.fail('Should have thrown an error')
        } catch (error: any) {
          expect(error.message).to.include(`Intent hash must be 32 bytes`)
        }
      })
    })

    describe('extend_intent', () => {
      it('should extend an intent with more data', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, {
          isFinal: false,
        })

        const extendParams = {
          moreDataHex: TEST_DATA_HEX_1,
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('010203070809')
        expect(intent.isFinal).to.be.false
      })

      it('should extend an intent with more max_fees', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const newMint = Keypair.generate().publicKey
        const extendParams = {
          moreMaxFees: [
            {
              mint: newMint,
              amount: 2000,
            },
          ],
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.maxFees.length).to.be.eq(2)
        expect(intent.maxFees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE)
        expect(intent.maxFees[1].mint.toString()).to.be.eq(newMint.toString())
        expect(intent.maxFees[1].amount.toNumber()).to.be.eq(2000)
      })

      it('should extend an intent with more events', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const newTopic = Buffer.from(Array(32).fill(2)).toString('hex')
        const extendParams = {
          moreEventsHex: [
            {
              topicHex: newTopic,
              dataHex: TEST_DATA_HEX_2,
            },
          ],
        }

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

      it('should extend an intent with all optional fields', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const newMint = Keypair.generate().publicKey
        const newTopic = Buffer.from(Array(32).fill(3)).toString('hex')
        const extendParams = {
          moreDataHex: '0d0e0f',
          moreMaxFees: [
            {
              mint: newMint,
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

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('0102030d0e0f')
        expect(intent.maxFees.length).to.be.eq(2)
        expect(intent.maxFees[1].amount.toNumber()).to.be.eq(3000)
        expect(intent.events.length).to.be.eq(2)
        expect(Buffer.from(intent.events[1].data).toString('hex')).to.be.eq('101112')
      })

      it('should extend an intent to a large size', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })
        const intentKey = sdk.getIntentKey(intentHash)

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

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const intentAcc = client.getAccount(intentKey)
        expect(intent.intentData.length).to.be.eq(3 + 5000) // Keep literal for specific test case
        expect(intent.maxFees.length).to.be.eq(58)
        expect(intent.events.length).to.be.eq(51)
        expect(intent.isFinal).to.be.false
        expect(intentAcc?.data.length).to.be.eq(19361)
      })

      it('should finalize an intent', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const extendParams = {}

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.true
      })

      it('should extend and finalize an intent in one call', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const extendParams = {
          moreDataHex: '191a1b',
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('010203191a1b')
        expect(intent.isFinal).to.be.true
      })

      it('should extend an intent multiple times', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

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
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('0102031c1d1e1f2021')
        expect(intent.isFinal).to.be.false
      })

      it('cannot extend intent if not intent creator', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: false })

        const extendParams = {
          moreDataHex: '222324',
        }

        const ix = await maliciousSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be intent creator`)
      })

      it('cannot extend non-existent intent', async () => {
        const intentHash = generateIntentHash()

        const extendParams = {
          moreDataHex: '252627',
        }

        const ix = await sdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(provider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })

      it('cannot extend intent if already finalized', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })

        const extendParams = {
          moreDataHex: '28292a',
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Intent is already final`)
      })

      it('cannot finalize already finalized intent', async () => {
        const intentHash = await createTestIntent(solverSdk, solverProvider, { isFinal: true })

        const extendParams = {}

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Intent is already final`)
      })
    })

    describe('claim_stale_intent', () => {
      const createTestIntentWithDeadline = async (deadline: number, isFinal = false): Promise<string> => {
        return createTestIntent(solverSdk, solverProvider, { deadline, isFinal })
      }

      it('should claim stale intent', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        const intentBefore = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intentBefore).to.not.be.null

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        const intentBalanceBefore = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
        const intentCreatorBalanceBefore = Number(provider.client.getBalance(intentBefore.intentCreator)) || 0

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)

        const intentBalanceAfter = Number(provider.client.getBalance(sdk.getIntentKey(intentHash))) || 0
        const intentCreatorBalanceAfter = Number(provider.client.getBalance(intentBefore.intentCreator)) || 0

        try {
          await program.account.intent.fetch(sdk.getIntentKey(intentHash))
          expect.fail('Intent account should be closed')
        } catch (error: any) {
          expect(error.message).to.include(`Account does not exist`)
        }

        expect(intentCreatorBalanceAfter).to.be.eq(intentCreatorBalanceBefore + intentBalanceBefore - ACCOUNT_CLOSE_FEE)
        expect(intentBalanceAfter).to.be.eq(0)
      })

      it('cannot claim intent if deadline has not passed', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + LONG_DEADLINE
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, WARP_TIME_SHORT)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'Intent not yet expired')
      })

      it('cannot claim intent if deadline equals now', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + MEDIUM_DEADLINE
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, MEDIUM_DEADLINE)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, 'Intent not yet expired')
      })

      it('cannot claim stale intent if not intent creator', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + EXPIRATION_TEST_DELAY
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, EXPIRATION_TEST_DELAY_PLUS_ONE)

        const ix = await maliciousSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be intent creator`)
      })

      it('cannot claim non-existent intent', async () => {
        const intentHash = generateIntentHash()

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })

      it('cannot claim intent twice', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + DOUBLE_CLAIM_DELAY
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, DOUBLE_CLAIM_DELAY_PLUS_ONE)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        const errorMsg = res.toString()
        expect(errorMsg.includes(`AccountNotInitialized`)).to.be.true
      })
    })

    describe('create_proposal', () => {
      it('should create a proposal', async () => {
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
            data: TEST_DATA_HEX_3,
          },
        ]

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)
        if (res instanceof FailedTransactionMetadata) {
          throw new Error(`Failed to create proposal: ${res.toString()}`)
        }

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.intent.toString()).to.be.eq(sdk.getIntentKey(intentHash).toString())
        expect(proposal.proposalCreator.toString()).to.be.eq(solver.publicKey.toString())
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

      it('should create a proposal with multiple instructions', async () => {
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

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

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

      it('should create a proposal with empty instructions', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + PROPOSAL_DEADLINE_OFFSET

        const instructions: any[] = []

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)
        if (res instanceof FailedTransactionMetadata) {
          throw new Error(`Failed to create proposal: ${res.toString()}`)
        }

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.instructions.length).to.be.eq(0)
      })

      it('cannot create proposal if not whitelisted solver', async () => {
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

        const ix = await maliciousSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expectTransactionError(res, 'AccountNotInitialized')
      })

      it('cannot create proposal with deadline in the past', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now - SHORT_DEADLINE

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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Deadline must be in the future`)
      })

      it('cannot create proposal with deadline equal to now', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now

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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Deadline must be in the future`)
      })

      it('cannot create proposal if intent deadline has passed', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const intentDeadline = now + SHORT_DEADLINE

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline: intentDeadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        warpSeconds(provider, 101)

        const proposalDeadline = now + 200
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, `Intent has already expired`)
      })

      it('cannot create proposal if proposal deadline exceeds intent deadline', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const intentDeadline = Number((await program.account.intent.fetch(sdk.getIntentKey(intentHash))).deadline)
        const proposalDeadline = intentDeadline + SHORT_DEADLINE

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Proposal deadline can't be after the Intent's deadline`)
      })

      it('cannot create proposal if intent has insufficient validations', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 2,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations to 1 (less than min_validations of 2)
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        const proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, [], proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, `Intent has insufficient validations`)
      })

      it('cannot create proposal if intent is not final', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: false })
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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Intent is not final`)
      })

      it('cannot create proposal if fulfilled_intent PDA already exists', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + PROPOSAL_DEADLINE_OFFSET

        // Mock FulfilledIntent
        const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
        client.setAccount(fulfilledIntent, {
          executable: false,
          lamports: 1002240,
          owner: program.programId,
          data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
        })

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(
          res,
          `AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned. Error Number: 3011. Error Message: The given account is not owned by the system program`
        )
      })

      it('cannot create proposal with same intent_hash and solver twice', async () => {
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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, `already in use`)
      })

      it('cannot create proposal for non-existent intent', async () => {
        const intentHash = generateIntentHash()
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + PROPOSAL_DEADLINE_OFFSET

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, [], deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })

      it('should create proposal with fees matching intent max_fees', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET
        const mint = Keypair.generate().publicKey

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        const proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const fees = [
          {
            mint,
            amount: DEFAULT_MAX_FEE_HALF,
          },
        ]

        const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
        await makeTxSignAndSend(solverProvider, proposalIx)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.fees.length).to.be.eq(1)
        expect(proposal.fees[0].mint.toString()).to.be.eq(mint.toString())
        expect(proposal.fees[0].amount.toNumber()).to.be.eq(DEFAULT_MAX_FEE_HALF)
      })

      it('cannot create proposal with fees exceeding max_fees', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET
        const mint = Keypair.generate().publicKey

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        const proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const fees = [
          {
            mint,
            amount: DEFAULT_MAX_FEE_EXCEED, // Exceeds max_fee
          },
        ]

        const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, proposalIx)

        expect(res).to.be.instanceOf(FailedTransactionMetadata)
        expect(res.toString()).to.match(/FeeAmountExceedsMaxFee|Fee amount exceeds max fee/i)
      })

      it('cannot create proposal with fees having wrong mint', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + INTENT_DEADLINE_OFFSET
        const mint = Keypair.generate().publicKey
        const wrongMint = Keypair.generate().publicKey

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: DEFAULT_MIN_VALIDATIONS,
          dataHex: DEFAULT_DATA_HEX,
          maxFees: [
            {
              mint,
              amount: DEFAULT_MAX_FEE,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        const proposalDeadline = now + PROPOSAL_DEADLINE_OFFSET
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: TEST_DATA_HEX_3,
          },
        ]

        const fees = [
          {
            mint: wrongMint, // Wrong mint
            amount: DEFAULT_MAX_FEE_HALF,
          },
        ]

        const proposalIx = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, proposalIx)

        expect(res).to.be.instanceOf(FailedTransactionMetadata)
        expect(res.toString()).to.match(/InvalidFeeMint|Invalid fee mint/i)
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

      it('should add instructions to proposal', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions = [
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

      it('should add multiple instructions to proposal', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions = [
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

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
        await makeTxSignAndSend(solverProvider, ix)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.instructions.length).to.be.eq(3)
        expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('070809')
        expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq('0a0b0c')
        expect(proposal.isFinal).to.be.false
      })

      it('should add instructions to proposal multiple times', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions1 = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '0d0e0f',
          },
        ]
        const ix1 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions1, false)
        await makeTxSignAndSend(solverProvider, ix1)

        const moreInstructions2 = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '101112',
          },
        ]
        const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions2, false)
        await makeTxSignAndSend(solverProvider, ix2)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.instructions.length).to.be.eq(3)
        expect(Buffer.from(proposal.instructions[1].data).toString('hex')).to.be.eq('0d0e0f')
        expect(Buffer.from(proposal.instructions[2].data).toString('hex')).to.be.eq('101112')
        expect(proposal.isFinal).to.be.false
      })

      it('cannot add instructions if not proposal creator', async () => {
        const intentHash = await createTestProposal(false)
        const proposalCreator = (await program.account.proposal.fetch(solverSdk.getProposalKey(intentHash)))
          .proposalCreator

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '131415',
          },
        ]

        const ix = await maliciousSdk.addInstructionsToProposalIx(
          intentHash,
          moreInstructions,
          undefined,
          proposalCreator
        )
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be proposal creator`)
      })

      it('cannot add instructions to non-existent proposal', async () => {
        const intentHash = generateIntentHash()

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '161718',
          },
        ]

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })

      it('cannot add instructions if proposal deadline has passed', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
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

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '19202a',
          },
        ]

        const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, 'Proposal has already expired')
      })

      it('cannot add instructions if proposal deadline equals now', async () => {
        const intentHash = await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true })
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

        const fees = intent.maxFees.map((maxFee) => ({
          mint: maxFee.mint,
          amount: maxFee.amount.toNumber(),
        }))

        const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)

        warpSeconds(provider, WARP_TIME_SHORT)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '1b1c1d',
          },
        ]

        const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expectTransactionError(res, 'Proposal has already expired')
      })

      it('cannot add instructions if proposal is final', async () => {
        const intentHash = await createTestProposal(true)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '1e1f20',
          },
        ]

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Proposal is already final`)
      })

      it('should finalize proposal when adding instructions with finalize=true', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '212223',
          },
        ]

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, true)
        await makeTxSignAndSend(solverProvider, ix)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.isFinal).to.be.true
        expect(proposal.instructions.length).to.be.eq(2)
      })

      it('should not finalize proposal when adding instructions with finalize=false', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '242526',
          },
        ]

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions, false)
        await makeTxSignAndSend(solverProvider, ix)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.isFinal).to.be.false
        expect(proposal.instructions.length).to.be.eq(2)
      })

      it('should finalize proposal by default when adding instructions', async () => {
        const intentHash = await createTestProposal(false)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '272829',
          },
        ]

        const ix = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        await makeTxSignAndSend(solverProvider, ix)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.isFinal).to.be.true
        expect(proposal.instructions.length).to.be.eq(2)
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

      it('should claim stale proposal', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        const intentHash = await createTestProposalWithDeadline(deadline)

        const proposalBefore = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposalBefore).to.not.be.null

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        const proposalBalanceBefore =
          Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0
        const proposalCreatorBalanceBefore = Number(provider.client.getBalance(proposalBefore.proposalCreator)) || 0

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        await makeTxSignAndSend(solverProvider, ix)

        const proposalBalanceAfter =
          Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0
        const proposalCreatorBalanceAfter = Number(provider.client.getBalance(proposalBefore.proposalCreator)) || 0

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

      it('should claim multiple stale proposals', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + STALE_CLAIM_DELAY
        const intentHashes = await Promise.all(
          Array.from({ length: 20 }, async () => await createTestProposalWithDeadline(deadline))
        )

        for (const intentHash of intentHashes) {
          const proposalBefore = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposalBefore).to.not.be.null
        }

        warpSeconds(provider, STALE_CLAIM_DELAY_PLUS_ONE)

        const proposalBalancesBefore = intentHashes.reduce(
          (acc, intentHash) =>
            acc + Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0,
          0
        )
        const proposalCreatorBalanceBefore = Number(provider.client.getBalance(solver.publicKey)) || 0

        const ix = await solverSdk.claimStaleProposalIx(intentHashes)
        await makeTxSignAndSend(solverProvider, ix)

        const proposalBalancesAfter = intentHashes.reduce(
          (acc, intentHash) =>
            acc + Number(provider.client.getBalance(sdk.getProposalKey(intentHash, solver.publicKey))) || 0,
          0
        )
        const proposalCreatorBalanceAfter = Number(provider.client.getBalance(solver.publicKey)) || 0

        for (const intentHash of intentHashes) {
          try {
            await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
            expect.fail('Proposal account should be closed')
          } catch (error: any) {
            expect(error.message).to.include(`Account does not exist`)
          }
        }

        expect(proposalCreatorBalanceAfter).to.be.eq(
          proposalCreatorBalanceBefore + proposalBalancesBefore - ACCOUNT_CLOSE_FEE
        )
        expect(proposalBalancesAfter).to.be.eq(0)
      })

      it('cannot claim proposal if deadline has not passed', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + LONG_DEADLINE
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, WARP_TIME_SHORT)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Proposal not yet expired`)
      })

      it('cannot claim proposal if deadline equals now', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + MEDIUM_DEADLINE
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, MEDIUM_DEADLINE)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `Proposal not yet expired`)
      })

      it('cannot claim stale proposal if not proposal creator', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + EXPIRATION_TEST_DELAY
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, EXPIRATION_TEST_DELAY_PLUS_ONE)

        const ix = await maliciousSdk.claimStaleProposalIx([intentHash], solver.publicKey)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expectTransactionError(res, `Signer must be proposal creator`)
      })

      it('cannot claim non-existent proposal', async () => {
        const intentHash = generateIntentHash()

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expectTransactionError(res, `AccountNotInitialized`)
      })

      it('cannot claim proposal twice', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + DOUBLE_CLAIM_DELAY
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, DOUBLE_CLAIM_DELAY_PLUS_ONE)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix2)

        const errorMsg = res.toString()
        expect(errorMsg.includes(`AccountNotInitialized`)).to.be.true
      })
    })
  })
})
