import { Program, web3 } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
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
} from './constants'

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
