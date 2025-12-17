/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
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
  SHORT_DEADLINE,
  STALE_CLAIM_DELAY,
  STALE_CLAIM_DELAY_PLUS_ONE,
  TEST_DATA_HEX_1,
  TEST_DATA_HEX_2,
  WARP_TIME_LONG,
  WARP_TIME_SHORT,
} from './helpers/constants'
import { createTestIntent, expectTransactionError, generateIntentHash, generateNonce } from './helpers/settler-helpers'
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
  })
})
