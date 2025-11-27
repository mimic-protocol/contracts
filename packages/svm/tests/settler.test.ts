/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { signAsync } from '@noble/ed25519'
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
        expect(intent.validators.length).to.be.eq(0)
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
        expect(intentAcc?.data.length).to.be.eq(19361)
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

    describe('create_proposal', () => {
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const createValidatedIntent = async (isFinal = true): Promise<string> => {
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
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, isFinal)
        await makeTxSignAndSend(solverProvider, ix)

        // Set validations to meet min_validations requirement
        const intentKey = sdk.getIntentKey(intentHash)
        const intentAccount = client.getAccount(intentKey)
        if (intentAccount) {
          const intentData = Buffer.from(intentAccount.data)
          // validations is at offset: 8 (disc) + 1 (op) + 32 (user) + 32 (intent_creator) + 32 (intent_hash) + 32 (nonce) + 8 (deadline) + 2 (min_validations) = 147
          // validations is u16, so 2 bytes
          intentData.writeUInt16LE(1, 147)
          client.setAccount(intentKey, {
            ...intentAccount,
            data: intentData,
          })
        }

        return intentHash
      }

      it('should create a proposal', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

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
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        await makeTxSignAndSend(solverProvider, ix)

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
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

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

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        await makeTxSignAndSend(solverProvider, ix)

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
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        const instructions: any[] = []

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        await makeTxSignAndSend(solverProvider, ix)

        const proposal = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposal.instructions.length).to.be.eq(0)
      })

      it('cant create proposal if not whitelisted solver', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await maliciousSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(maliciousProvider, ix)
        expect(res.toString()).to.include(
          'AnchorError caused by account: solver_registry. Error Code: AccountNotInitialized'
        )
      })

      it('cant create proposal with deadline in the past', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now - 100

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Deadline must be in the future`)
      })

      it('cant create proposal with deadline equal to now', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Deadline must be in the future`)
      })

      it('cant create proposal if intent deadline has passed', async () => {
        const intentHash = generateIntentHash()
        const nonce = generateNonce()
        const user = Keypair.generate().publicKey
        const now = Number(client.getClock().unixTimestamp)
        const intentDeadline = now + 100

        const params = {
          op: OpType.Transfer,
          user,
          nonceHex: nonce,
          deadline: intentDeadline,
          minValidations: 1,
          dataHex: '010203',
          maxFees: [],
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
            data: 'deadbeef',
          },
        ]

        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`Intent has already expired`)
      })

      it('cant create proposal if proposal deadline exceeds intent deadline', async () => {
        const intentHash = await createValidatedIntent(true)
        const intentDeadline = Number((await program.account.intent.fetch(sdk.getIntentKey(intentHash))).deadline)
        const proposalDeadline = intentDeadline + 100

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Proposal deadline can't be after the Intent's deadline`)
      })

      it('cant create proposal if intent has insufficient validations', async () => {
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
          minValidations: 2,
          dataHex: '010203',
          maxFees: [],
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

        const proposalDeadline = now + 1800
        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, proposalDeadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`Intent has insufficient validations`)
      })

      it('cant create proposal if intent is not final', async () => {
        const intentHash = await createValidatedIntent(false)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Intent is not final`)
      })

      it('cant create proposal if fulfilled_intent PDA already exists', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        // Mock FulfilledIntent
        const fulfilledIntent = sdk.getFulfilledIntentKey(intentHash)
        client.setAccount(fulfilledIntent, {
          executable: false,
          lamports: 1002240,
          owner: program.programId,
          data: Buffer.from('595168911b9267f7' + '010000000000000000', 'hex'),
        })

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(
          `AnchorError caused by account: fulfilled_intent. Error Code: AccountNotSystemOwned. Error Number: 3011. Error Message: The given account is not owned by the system program`
        )
      })

      it('cant create proposal with same intent_hash and solver twice', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`already in use`)
      })

      it('cant create proposal for non-existent intent', async () => {
        const intentHash = generateIntentHash()
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: 'deadbeef',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline)
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`AccountNotInitialized`)
      })
    })

    describe('add_instructions_to_proposal', () => {
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const createValidatedIntent = async (isFinal = true): Promise<string> => {
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
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, isFinal)
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

        return intentHash
      }

      const createTestProposal = async (isFinal = false): Promise<string> => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 1800

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
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline, isFinal)
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

      it('cant add instructions if not proposal creator', async () => {
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

        expect(res.toString()).to.include(`Signer must be proposal creator`)
      })

      it('cant add instructions to non-existent proposal', async () => {
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

        expect(res.toString()).to.include(`AccountNotInitialized`)
      })

      it('cant add instructions if proposal deadline has passed', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 50

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '010203',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)

        warpSeconds(provider, 51)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '19202a',
          },
        ]

        const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`Proposal has already expired`)
      })

      it('cant add instructions if proposal deadline equals now', async () => {
        const intentHash = await createValidatedIntent(true)
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 100

        const instructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '010203',
          },
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)

        warpSeconds(provider, 100)

        const moreInstructions = [
          {
            programId: Keypair.generate().publicKey,
            accounts: [],
            data: '1b1c1d',
          },
        ]

        const ix2 = await solverSdk.addInstructionsToProposalIx(intentHash, moreInstructions)
        const res = await makeTxSignAndSend(solverProvider, ix2)

        expect(res.toString()).to.include(`Proposal has already expired`)
      })

      it('cant add instructions if proposal is final', async () => {
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

        expect(res.toString()).to.include(`Proposal is already final`)
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
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const createValidatedIntent = async (isFinal = true): Promise<string> => {
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
          maxFees: [],
          eventsHex: [],
        }

        const ix = await solverSdk.createIntentIx(intentHash, params, isFinal)
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

        return intentHash
      }

      const createTestProposalWithDeadline = async (deadline: number): Promise<string> => {
        const intentHash = await createValidatedIntent(true)

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
        ]

        const ix = await solverSdk.createProposalIx(intentHash, instructions, deadline, false)
        await makeTxSignAndSend(solverProvider, ix)
        return intentHash
      }

      it('should claim stale proposal', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 50
        const intentHash = await createTestProposalWithDeadline(deadline)

        const proposalBefore = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
        expect(proposalBefore).to.not.be.null

        warpSeconds(provider, 51)

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

        expect(proposalCreatorBalanceAfter).to.be.eq(proposalCreatorBalanceBefore + proposalBalanceBefore - 5000)
        expect(proposalBalanceAfter).to.be.eq(0)
      })

      it('should claim multiple stale proposals', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 50
        const intentHashes = await Promise.all(
          Array.from({ length: 20 }, async () => await createTestProposalWithDeadline(deadline))
        )

        for (const intentHash of intentHashes) {
          const proposalBefore = await program.account.proposal.fetch(sdk.getProposalKey(intentHash, solver.publicKey))
          expect(proposalBefore).to.not.be.null
        }

        warpSeconds(provider, 51)

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

        expect(proposalCreatorBalanceAfter).to.be.eq(proposalCreatorBalanceBefore + proposalBalancesBefore - 5000)
        expect(proposalBalancesAfter).to.be.eq(0)
      })

      it('cant claim proposal if deadline has not passed', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 500
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, 100)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Proposal not yet expired`)
      })

      it('cant claim proposal if deadline equals now', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 300
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, 300)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`Proposal not yet expired`)
      })

      it('cant claim stale proposal if not proposal creator', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 80
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, 81)

        const ix = await maliciousSdk.claimStaleProposalIx([intentHash], solver.publicKey)
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Signer must be proposal creator`)
      })

      it('cant claim non-existent proposal', async () => {
        const intentHash = generateIntentHash()

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix)

        expect(res.toString()).to.include(`AccountNotInitialized`)
      })

      it('cant claim proposal twice', async () => {
        const now = Number(client.getClock().unixTimestamp)
        const deadline = now + 90
        const intentHash = await createTestProposalWithDeadline(deadline)

        warpSeconds(provider, 91)

        const ix = await solverSdk.claimStaleProposalIx([intentHash])
        await makeTxSignAndSend(solverProvider, ix)

        client.expireBlockhash()
        const ix2 = await solverSdk.claimStaleProposalIx([intentHash])
        const res = await makeTxSignAndSend(solverProvider, ix2)

        const errorMsg = res.toString()
        expect(errorMsg.includes(`AccountNotInitialized`)).to.be.true
      })
    })

    describe('add_validator_sigs', () => {
      const generateIntentHash = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      const generateNonce = (): string => {
        return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('hex')
      }

      it('debug', async () => {
        const intentHash = generateIntentHash()
        const intentKey = sdk.getIntentKey(intentHash)
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

        const createIntentIx = await solverSdk.createIntentIx(intentHash, params, true)
        await makeTxSignAndSend(solverProvider, createIntentIx)

        const validator = Keypair.generate()

        const whitelistValidatorIx = await whitelistSdk.setEntityWhitelistStatusIx(
          EntityType.Validator,
          validator.publicKey,
          WhitelistStatus.Whitelisted
        )
        await makeTxSignAndSend(provider, whitelistValidatorIx)

        // New stuff

        const signature = await signAsync(Buffer.from(intentHash, 'hex'), validator.secretKey.slice(0, 32))
        const sigBytes: Uint8Array = new Uint8Array(signature)
        const sigNums: number[] = Array.from(sigBytes)

        const ixs = await solverSdk.addValidatorSigIxs(
          intentKey,
          Buffer.from(intentHash, 'hex'),
          validator.publicKey,
          sigNums
        )
        const res = await makeTxSignAndSend(solverProvider, ...ixs)

        console.log(res.toString())
      })
    })
  })
})
