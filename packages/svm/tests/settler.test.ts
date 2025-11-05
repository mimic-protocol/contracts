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

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()

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
      it('cant initialize if not deployer', async () => {
        const ix = await maliciousSdk.initializeIx()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only Deployer can call this instruction.`)
      })

      it('should call initialize', async () => {
        const ix = await sdk.initializeIx()
        await makeTxSignAndSend(provider, ix)

        const settings = await program.account.settlerSettings.fetch(sdk.getSettlerSettingsPubkey())
        expect(settings.whitelistProgram.toString()).to.be.eq(WhitelistIDL.address)
        expect(settings.isPaused).to.be.false
      })

      it('cant call initialize again', async () => {
        const ix = await sdk.initializeIx()
        const res = await makeTxSignAndSend(provider, ix)

        expect(res.toString()).to.include(
          `Allocate: account Address { address: ${sdk.getSettlerSettingsPubkey()}, base: None } already in use`
        )
      })
    })

    describe('create_intent', () => {
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      it('should create an intent', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '010203',
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: 1000,
            },
          ],
          eventsHex: [
            {
              topicHex: Buffer.from(Array(32).fill(1)).toString('hex'),
              dataHex: '040506',
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
        expect(intent.minValidations).to.be.eq(1)
        expect(intent.validations).to.be.eq(0)
        expect(intent.isFinal).to.be.false
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('010203')
        expect(intent.maxFees.length).to.be.eq(1)
        expect(intent.maxFees[0].mint.toString()).to.be.eq(params.maxFees[0].mint.toString())
        expect(intent.maxFees[0].amount.toNumber()).to.be.eq(1000)
        expect(intent.events.length).to.be.eq(1)
        expect(Buffer.from(intent.events[0].topic).toString('hex')).to.be.eq(params.eventsHex[0].topicHex)
        expect(Buffer.from(intent.events[0].data).toString('hex')).to.be.eq('040506')
      })

      it('should create an intent with empty data', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Swap,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 2,
          dataHex: '',
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: 2000,
            },
          ],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.op).to.deep.include({ swap: {} })
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('')
        expect(intent.isFinal).to.be.true
      })

      it('should create an intent with empty max_fees', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Call,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 3,
          dataHex: '070809',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.op).to.deep.include({ call: {} })
        expect(intent.maxFees.length).to.be.eq(0)
      })

      it('should create an intent with empty events', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '0a0b0c',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.events.length).to.be.eq(0)
      })

      it('should create an intent with is_final true', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.true
      })

      it('should create an intent with is_final false', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.false
      })

      it('cant create intent if not whitelisted solver', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await maliciousSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expect(res.toString()).to.include(
          'AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized'
        )

        const intent = client.getAccount(sdk.getIntentKey(intentHash))
        expect(intent).to.be.null
      })

      it('cant create intent with deadline in the past', async () => {
        warpSeconds(provider, 500)

        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now - 100

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Deadline must be in the future`)
      })

      it('cant create intent with deadline equal to now', async () => {
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
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Deadline must be in the future`)
      })

      it('cant create intent if fulfilled_intent PDA already exists', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
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

        expect(res.toString()).to.include(
          `AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned. Error Number: 3011. Error Message: The given account is not owned by the system program`
        )
      })

      it('cant create intent with same intent_hash twice', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, false)
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.createIntentIx(intentHash, params, false)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`already in use`)
      })

      it('cant create intent with invalid intent_hash', async () => {
        const invalidIntentHash = '123456'
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '',
          maxFees: [],
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
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const createTestIntent = async (isFinal = false): Promise<string> => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 3600

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '010203',
          maxFees: [
            {
              mint: Keypair.generate().publicKey,
              amount: 1000,
            },
          ],
          eventsHex: [
            {
              topicHex: Buffer.from(Array(32).fill(1)).toString('hex'),
              dataHex: '040506',
            },
          ],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, isFinal)
        await makeTxSignAndSend(solverProvider, ix)
        return intentHash
      }

      it('should extend an intent with more data', async () => {
        const intentHash = await createTestIntent(false)

        const extendParams = {
          moreDataHex: '070809',
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(Buffer.from(intent.intentData).toString('hex')).to.be.eq('010203070809')
        expect(intent.isFinal).to.be.false
      })

      it('should extend an intent with more max_fees', async () => {
        const intentHash = await createTestIntent(false)

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
        expect(intent.maxFees[0].amount.toNumber()).to.be.eq(1000)
        expect(intent.maxFees[1].mint.toString()).to.be.eq(newMint.toString())
        expect(intent.maxFees[1].amount.toNumber()).to.be.eq(2000)
      })

      it('should extend an intent with more events', async () => {
        const intentHash = await createTestIntent(false)

        const newTopic = Buffer.from(Array(32).fill(2)).toString('hex')
        const extendParams = {
          moreEventsHex: [
            {
              topicHex: newTopic,
              dataHex: '0a0b0c',
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
        const intentHash = await createTestIntent(false)

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
        const intentHash = await createTestIntent(false)
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
        expect(intent.intentData.length).to.be.eq(3 + 5000)
        expect(intent.maxFees.length).to.be.eq(58)
        expect(intent.events.length).to.be.eq(51)
        expect(intent.isFinal).to.be.false
        expect(intentAcc?.data.length).to.be.eq(19325)
      })

      it('should finalize an intent', async () => {
        const intentHash = await createTestIntent(false)

        const extendParams = {}

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        await makeTxSignAndSend(solverProvider, ix)

        const intent = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intent.isFinal).to.be.true
      })

      it('should extend and finalize an intent in one call', async () => {
        const intentHash = await createTestIntent(false)

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
        const intentHash = await createTestIntent(false)

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

      it('cant extend intent if not intent creator', async () => {
        const intentHash = await createTestIntent(false)

        const extendParams = {
          moreDataHex: '222324',
        }

        const ix = await maliciousSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Signer must be intent creator`)
      })

      it('cant extend non-existent intent', async () => {
        const intentHash = generateIntentHash()

        const extendParams = {
          moreDataHex: '252627',
        }

        const ix = await sdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(provider, ix)

        expect(res.toString()).to.include(`AccountNotInitialized`)
      })

      it('cant extend intent if already finalized', async () => {
        const intentHash = await createTestIntent(true)

        const extendParams = {
          moreDataHex: '28292a',
        }

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, false)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Intent is already final`)
      })

      it('cant finalize already finalized intent', async () => {
        const intentHash = await createTestIntent(true)

        const extendParams = {}

        const ix = await solverSdk.extendIntentIx(intentHash, extendParams, true)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Intent is already final`)
      })
    })

    describe('claim_stale_intent', () => {
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const createTestIntentWithDeadline = async (deadline: number, isFinal = false): Promise<string> => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline,
          minValidations: 1,
          dataHex: '010203',
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, isFinal)
        await makeTxSignAndSend(solverProvider, ix)
        return intentHash
      }

      it('should claim stale intent', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 50
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        const intentBefore = await program.account.intent.fetch(sdk.getIntentKey(intentHash))
        expect(intentBefore).to.not.be.null

        warpSeconds(provider, 51)

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

        expect(intentCreatorBalanceAfter).to.be.eq(intentCreatorBalanceBefore + intentBalanceBefore - 5000)
        expect(intentBalanceAfter).to.be.eq(0)
      })

      it('cant claim intent if deadline has not passed', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 500
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, 100)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Intent not yet expired`)
      })

      it('cant claim intent if deadline equals now', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 300
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, 300)

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Intent not yet expired`)
      })

      it('cant claim stale intent if not intent creator', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 80
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, 81)

        const ix = await maliciousSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Signer must be intent creator`)
      })

      it('cant claim non-existent intent', async () => {
        const intentHash = generateIntentHash()

        const ix = await solverSdk.claimStaleIntentIx(intentHash)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`AccountNotInitialized`)
      })

      it('cant claim intent twice', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 90
        const intentHash = await createTestIntentWithDeadline(deadline, false)

        warpSeconds(provider, 91)

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
