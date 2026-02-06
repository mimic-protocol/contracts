import { Program } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { CreateIntentParams, OpType, TokenFee } from '../../sdks/settler/types'
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
import { generateNonce, getCurrentTimestamp, randomPubkey } from './misc'

export type IntentAccount = NonNullable<Awaited<ReturnType<Program<Settler>['account']['intent']['fetch']>>>

export type CreateIntentOptions = Partial<CreateIntentParams> & { isFinal?: boolean }

/**
 * Generate a random 32-byte hex string for intent hash
 */
export function generateIntentHash(): string {
  return randomHex(INTENT_HASH_LENGTH)
}

/**
 * Create intent params with defaults
 * Takes partial params and fills in defaults
 */
export function createIntentParams(client: LiteSVM, params: Partial<CreateIntentParams> = {}): CreateIntentParams {
  return {
    ...getDefaultCreateIntentParams(client),
    ...params,
  }
}

/**
 * Create a test intent with configurable parameters
 */
export async function createTestIntent(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  options: CreateIntentOptions = {}
): Promise<string> {
  const client = solverProvider.client
  const intentHash = generateIntentHash()
  const params = createIntentParams(client, options)

  const ix = await solverSdk.createIntentIx(intentHash, params, options.isFinal)
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
  numValidators: number
): Promise<void> {
  const intentKey = solverSdk.getIntentKey(intentHash)
  const program = new Program<Settler>(SettlerIDL, solverProvider)

  // Fetch and deserialize the intent account
  const intent = await program.account.intent.fetch(intentKey)

  // Generate validators
  const validators: PublicKey[] = []
  for (let i = 0; i < numValidators; i++) {
    validators.push(randomPubkey())
  }

  // Modify the intent to add validators
  const modifiedIntent = {
    ...intent,
    validators,
  }

  // Serialize the modified intent back to account data
  const serializedData = await program.coder.accounts.encode('intent', modifiedIntent)

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
  options: CreateIntentOptions = {}
): Promise<string> {
  const intentHash = await createTestIntent(solverSdk, solverProvider, options)

  // Add validators to meet min_validations requirement
  const minValidations = options.minValidations ?? DEFAULT_MIN_VALIDATIONS
  await addValidatorsToIntent(intentHash, solverSdk, solverProvider, client, minValidations)

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

const DEFAULT_CREATE_INTENT_PARAMS: Omit<CreateIntentParams, 'deadline'> = {
  op: OpType.Transfer,
  user: randomPubkey(),
  nonceHex: generateNonce(),
  minValidations: DEFAULT_MIN_VALIDATIONS,
  dataHex: DEFAULT_DATA_HEX,
  maxFees: [
    {
      mint: randomPubkey(),
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

function getDefaultCreateIntentParams(client: LiteSVM): CreateIntentParams {
  return {
    ...DEFAULT_CREATE_INTENT_PARAMS,
    deadline: getCurrentTimestamp(client, INTENT_DEADLINE_OFFSET),
  }
}
