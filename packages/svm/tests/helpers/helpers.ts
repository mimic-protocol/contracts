import { Program, web3 } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { signAsync } from '@noble/ed25519'
import { Keypair, PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm'

import ControllerSDK, { EntityType } from '../../sdks/controller/Controller'
import SettlerSDK from '../../sdks/settler/Settler'
import { CreateIntentParams, IntentEvent, OpType, ProposalInstruction, TokenFee } from '../../sdks/settler/types'
import * as SettlerIDL from '../../target/idl/settler.json'
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
  PROPOSAL_DEADLINE_OFFSET,
  TEST_DATA_HEX_3,
} from './constants'

type IntentAccount = NonNullable<Awaited<ReturnType<Program<Settler>['account']['intent']['fetch']>>>

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Generate a random 32-byte hex string for intent hash
 */
export function generateIntentHash(): string {
  return randomHex(INTENT_HASH_LENGTH).slice(2)
}

/**
 * Generate a random 32-byte hex string for nonce
 */
export function generateNonce(): string {
  return randomHex(NONCE_LENGTH).slice(2)
}

/**
 * Get current timestamp with optional offset
 */
export function getCurrentDeadline(client: LiteSVM, offset: number = INTENT_DEADLINE_OFFSET): number {
  const now = Number(client.getClock().unixTimestamp)
  return now + offset
}

/**
 * Get proposal deadline with default PROPOSAL_DEADLINE_OFFSET
 */
export function getProposalDeadline(client: LiteSVM, offset?: number): number {
  return getCurrentDeadline(client, offset ?? PROPOSAL_DEADLINE_OFFSET)
}

/**
 * Create intent params with defaults (following EVM pattern)
 * Takes partial params and fills in defaults
 */
export function createIntentParams(client: LiteSVM, params: Partial<CreateIntentParams> = {}): CreateIntentParams {
  return {
    op: params.op ?? OpType.Transfer,
    user: params.user ?? Keypair.generate().publicKey,
    nonceHex: params.nonceHex ?? generateNonce(),
    deadline: params.deadline ?? getCurrentDeadline(client, INTENT_DEADLINE_OFFSET),
    minValidations: params.minValidations ?? DEFAULT_MIN_VALIDATIONS,
    dataHex: params.dataHex ?? DEFAULT_DATA_HEX,
    maxFees: params.maxFees ?? [
      {
        mint: Keypair.generate().publicKey,
        amount: DEFAULT_MAX_FEE,
      },
    ],
    eventsHex: params.eventsHex ?? [
      {
        topicHex: DEFAULT_TOPIC_HEX,
        dataHex: DEFAULT_EVENT_DATA_HEX,
      },
    ],
  }
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
  const deadline = options.deadline ?? getCurrentDeadline(client, INTENT_DEADLINE_OFFSET)

  const params: CreateIntentParams = createIntentParams(client, {
    op: options.op,
    user,
    nonceHex: nonce,
    deadline,
    minValidations: options.minValidations,
    dataHex: options.dataHex,
    maxFees: options.maxFees,
    eventsHex: options.eventsHex,
  })

  const ix = await solverSdk.createIntentIx(intentHash, params, options.isFinal ?? false)
  const res = await makeTxSignAndSend(solverProvider, ix)
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`Failed to create intent: ${res.toString()}`)
  }
  return intentHash
}

/**
 * Add mock validators to an intent account
 */
export async function addValidatorsToIntent(
  intentHash: string,
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  numValidators: number,
  program?: Program<Settler>
): Promise<void> {
  const intentKey = solverSdk.getIntentKey(intentHash)
  const programInstance = program || new Program<Settler>(SettlerIDL, solverProvider)

  // Fetch and deserialize the intent account
  const intent = await programInstance.account.intent.fetch(intentKey)

  // Generate validators
  const validators: PublicKey[] = []
  for (let i = 0; i < numValidators; i++) {
    validators.push(Keypair.generate().publicKey)
  }

  // Modify the intent to add validators
  const modifiedIntent = {
    ...intent,
    validators,
  }

  // Serialize the modified intent back to account data
  const serializedData = await programInstance.coder.accounts.encode('intent', modifiedIntent)

  // Update the account data
  const intentAccount = client.getAccount(intentKey)
  if (intentAccount) {
    client.setAccount(intentKey, {
      ...intentAccount,
      data: serializedData,
    })
  }
}

/**
 * Create a validated intent (with validators added to meet min_validations requirement)
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
    program?: Program<Settler>
  } = {}
): Promise<string> {
  const intentHash = await createTestIntent(solverSdk, solverProvider, {
    ...options,
    isFinal: options.isFinal ?? true,
  })

  // Add validators to meet min_validations requirement
  const minValidations = options.minValidations ?? DEFAULT_MIN_VALIDATIONS
  await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, minValidations, options.program)

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
  const proposalDeadline = options.deadline ?? getProposalDeadline(client)

  const instructions = options.instructions || [createTestProposalInstruction()]

  const fees = options.fees || mapIntentFeesToTokenFees(intent)

  const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, proposalDeadline, true)
  const res = await makeTxSignAndSend(solverProvider, ix)
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`Failed to create proposal: ${res.toString()}`)
  }

  const proposalKey = solverSdk.getProposalKey(intentHash, solverProvider.wallet.publicKey)
  return { intentHash, proposalKey }
}

/**
 * Map intent maxFees to TokenFee format
 */
export function mapIntentFeesToTokenFees(intent: IntentAccount): TokenFee[] {
  return intent.maxFees.map((maxFee) => ({
    mint: maxFee.mint,
    amount: maxFee.amount.toNumber(),
  }))
}

/**
 * Create a test proposal instruction with sensible defaults
 */
export function createTestProposalInstruction(options?: {
  programId?: PublicKey
  accounts?: Array<{
    pubkey?: PublicKey
    isSigner?: boolean
    isWritable?: boolean
  }>
  data?: string
}): ProposalInstruction {
  return {
    programId: options?.programId ?? Keypair.generate().publicKey,
    accounts:
      options?.accounts?.map((acc) => ({
        pubkey: acc.pubkey ?? Keypair.generate().publicKey,
        isSigner: acc.isSigner ?? false,
        isWritable: acc.isWritable ?? true,
      })) ?? [],
    data: options?.data ?? TEST_DATA_HEX_3,
  }
}

/**
 * Create proposal params (intent, deadline, instructions, fees) for testing
 */
export async function createProposalParams(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  program: Program<Settler>,
  options?: {
    intentHash?: string
    intentOptions?: {
      isFinal?: boolean
      minValidations?: number
      deadline?: number
    }
    deadline?: number
    deadlineOffset?: number
    instructions?: ProposalInstruction[]
    fees?: TokenFee[]
    customFees?: boolean
  }
): Promise<{
  intentHash: string
  intent: IntentAccount
  deadline: number
  instructions: ProposalInstruction[]
  fees: TokenFee[]
}> {
  const intentHash =
    options?.intentHash ||
    (await createValidatedIntent(solverSdk, solverProvider, client, {
      isFinal: options?.intentOptions?.isFinal ?? true,
      minValidations: options?.intentOptions?.minValidations,
      deadline: options?.intentOptions?.deadline,
    }))

  const intent = await program.account.intent.fetch(solverSdk.getIntentKey(intentHash))

  const deadline = options?.deadline ?? getProposalDeadline(client, options?.deadlineOffset ?? PROPOSAL_DEADLINE_OFFSET)

  const instructions = options?.instructions ?? [createTestProposalInstruction()]

  const fees = options?.fees ?? (options?.customFees ? [] : mapIntentFeesToTokenFees(intent))

  return {
    intentHash,
    intent,
    deadline,
    instructions,
    fees,
  }
}

/**
 * Creates an allowlisted entity (validator, axia, or solver)
 */
export async function createAllowlistedEntity(
  controllerSdk: ControllerSDK,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityKeypair?: Keypair
): Promise<Keypair> {
  const entity = entityKeypair || Keypair.generate()
  const allowlistIx = await controllerSdk.setAllowedEntityIx(entityType, entity.publicKey)
  await makeTxSignAndSend(provider, allowlistIx)
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

export function toLamports(sol: number): bigint {
  return BigInt(sol * LAMPORTS_PER_SOL)
}

export function randomKeypair(): web3.Keypair {
  return web3.Keypair.generate()
}

export function randomPubkey(): web3.PublicKey {
  return randomKeypair().publicKey
}
