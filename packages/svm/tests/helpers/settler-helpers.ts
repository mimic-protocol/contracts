import { Program } from '@coral-xyz/anchor'
import { signAsync } from '@noble/ed25519'
import { Keypair, PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { CreateIntentParams, IntentEvent, OpType, ProposalInstruction, TokenFee } from '../../sdks/settler/types'
import WhitelistSDK, { EntityType, WhitelistStatus } from '../../sdks/whitelist/Whitelist'
import { Settler } from '../../target/types/settler'
import { makeTxSignAndSend } from '../utils'
import {
  DEFAULT_DATA_HEX,
  DEFAULT_EVENT_DATA_HEX,
  DEFAULT_MAX_FEE,
  DEFAULT_MIN_VALIDATIONS,
  DEFAULT_TOPIC_HEX,
  INTENT_DEADLINE_OFFSET,
  INTENT_HASH_LENGTH,
  NONCE_LENGTH,
} from './constants'

/**
 * Generate a random 32-byte hex string for intent hash
 */
export function generateIntentHash(): string {
  return Buffer.from(Array.from({ length: INTENT_HASH_LENGTH }, () => Math.floor(Math.random() * 256))).toString('hex')
}

/**
 * Generate a random 32-byte hex string for nonce
 */
export function generateNonce(): string {
  return Buffer.from(Array.from({ length: NONCE_LENGTH }, () => Math.floor(Math.random() * 256))).toString('hex')
}

/**
 * Create a test intent with configurable parameters
 */
export async function createTestIntent(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  options: {
    intentHash?: string
    nonce?: string
    user?: PublicKey
    deadline?: number
    op?: OpType
    minValidations?: number
    dataHex?: string
    maxFees?: TokenFee[]
    eventsHex?: IntentEvent[]
    isFinal?: boolean
  } = {}
): Promise<string> {
  const intentHash = options.intentHash || generateIntentHash()
  const nonce = options.nonce || generateNonce()
  const user = options.user || Keypair.generate().publicKey
  const client = solverProvider.client
  const now = Number(client.getClock().unixTimestamp)
  const deadline = options.deadline ?? now + INTENT_DEADLINE_OFFSET

  const params: CreateIntentParams = {
    op: options.op || OpType.Transfer,
    user,
    nonceHex: nonce,
    deadline,
    minValidations: options.minValidations ?? DEFAULT_MIN_VALIDATIONS,
    dataHex: options.dataHex ?? DEFAULT_DATA_HEX,
    maxFees: options.maxFees || [
      {
        mint: Keypair.generate().publicKey,
        amount: DEFAULT_MAX_FEE,
      },
    ],
    eventsHex: options.eventsHex || [
      {
        topicHex: DEFAULT_TOPIC_HEX,
        dataHex: DEFAULT_EVENT_DATA_HEX,
      },
    ],
  }

  const ix = await solverSdk.createIntentIx(intentHash, params, options.isFinal ?? false)
  const res = await makeTxSignAndSend(solverProvider, ix)
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`Failed to create intent: ${res.toString()}`)
  }
  return intentHash
}

/**
 * Create a validated intent (with validations set to meet min_validations requirement)
 */
export async function createValidatedIntent(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  options: {
    intentHash?: string
    minValidations?: number
    isFinal?: boolean
    deadline?: number
  } = {}
): Promise<string> {
  const intentHash = await createTestIntent(solverSdk, solverProvider, {
    ...options,
    isFinal: options.isFinal ?? true,
  })

  // Set validations to meet min_validations requirement
  const intentKey = solverSdk.getIntentKey(intentHash)
  const intentAccount = client.getAccount(intentKey)
  if (intentAccount) {
    const intentData = Buffer.from(intentAccount.data)
    // validations is at offset: 8 (disc) + 1 (op) + 32 (user) + 32 (intent_creator) + 32 (intent_hash) + 32 (nonce) + 8 (deadline) + 2 (min_validations) = 147
    // validations is u16, so 2 bytes
    const minValidations = options.minValidations ?? DEFAULT_MIN_VALIDATIONS
    intentData.writeUInt16LE(minValidations, 147)
    client.setAccount(intentKey, {
      ...intentAccount,
      data: intentData,
    })
  }

  return intentHash
}

/**
 * Create a finalized proposal
 */
export async function createFinalizedProposal(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  program: Program<Settler>,
  options: {
    intentHash?: string
    deadline?: number
    instructions?: ProposalInstruction[]
    fees?: TokenFee[]
  } = {}
): Promise<{ intentHash: string; proposalKey: PublicKey }> {
  const intentHash =
    options.intentHash || (await createValidatedIntent(solverSdk, solverProvider, client, { isFinal: true }))
  const intent = await program.account.intent.fetch(solverSdk.getIntentKey(intentHash))
  const now = Number(client.getClock().unixTimestamp)
  const proposalDeadline = options.deadline ?? now + 1800

  const instructions = options.instructions || [
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

  const fees =
    options.fees ||
    (intent.maxFees.map((maxFee) => ({
      mint: maxFee.mint,
      amount: maxFee.amount.toNumber(),
    })) as TokenFee[])

  const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline, true)
  const res = await makeTxSignAndSend(solverProvider, ix)
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`Failed to create proposal: ${res.toString()}`)
  }

  const proposalKey = solverSdk.getProposalKey(intentHash, solverProvider.wallet.publicKey)
  return { intentHash, proposalKey }
}

/**
 * Create a whitelisted entity (validator, axia, or solver)
 */
export async function createWhitelistedEntity(
  whitelistSdk: WhitelistSDK,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityKeypair?: Keypair
): Promise<Keypair> {
  const entity = entityKeypair || Keypair.generate()
  const whitelistIx = await whitelistSdk.setEntityWhitelistStatusIx(
    entityType,
    entity.publicKey,
    WhitelistStatus.Whitelisted
  )
  await makeTxSignAndSend(provider, whitelistIx)
  return entity
}

/**
 * Create an Ed25519 signature for a validator (signs intent hash)
 */
export async function createValidatorSignature(intentHash: string, validator: Keypair): Promise<number[]> {
  const signature = await signAsync(Buffer.from(intentHash, 'hex'), validator.secretKey.slice(0, 32))
  return Array.from(new Uint8Array(signature))
}

/**
 * Create an Ed25519 signature for an axia (signs proposal key)
 */
export async function createAxiaSignature(proposalKey: PublicKey, axia: Keypair): Promise<number[]> {
  const signature = await signAsync(proposalKey.toBuffer(), axia.secretKey.slice(0, 32))
  return Array.from(new Uint8Array(signature))
}

/**
 * Helper to expect transaction errors consistently
 */
export function expectTransactionError(
  res: TransactionMetadata | FailedTransactionMetadata | string,
  expectedMessage: string
): void {
  expect(typeof res).to.not.be.eq('TransactionMetadata')

  if (typeof res === 'string') {
    expect(res).to.include(expectedMessage)
  } else {
    expect(res.toString()).to.include(expectedMessage)
  }
}
