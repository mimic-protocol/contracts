import { Program } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { CreateIntentParams, IntentEvent, OpType, TokenFee } from '../../sdks/settler/types'
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
} from './constants'
import { generateNonce, getCurrentDeadline } from './misc'

export type IntentAccount = NonNullable<Awaited<ReturnType<Program<Settler>['account']['intent']['fetch']>>>

/**
 * Generate a random 32-byte hex string for intent hash
 */
export function generateIntentHash(): string {
  return randomHex(INTENT_HASH_LENGTH).slice(2)
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
 * Map intent maxFees to TokenFee format
 */
export function mapIntentFeesToTokenFees(intent: IntentAccount): TokenFee[] {
  return intent.maxFees.map((maxFee) => ({
    mint: maxFee.mint,
    amount: maxFee.amount.toNumber(),
  }))
}
