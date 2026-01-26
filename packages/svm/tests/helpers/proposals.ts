import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { ProposalInstruction, TokenFee } from '../../sdks/settler/types'
import { Settler } from '../../target/types/settler'
import { makeTxSignAndSend } from '../utils'
import { PROPOSAL_DEADLINE_OFFSET, TEST_DATA_HEX_3 } from './constants'
import { createValidatedIntent, IntentAccount, mapIntentFeesToTokenFees } from './intents'
import { getCurrentDeadline } from './misc'

/**
 * Get proposal deadline with default PROPOSAL_DEADLINE_OFFSET
 */
export function getProposalDeadline(client: LiteSVM, offset?: number): number {
  return getCurrentDeadline(client, offset ?? PROPOSAL_DEADLINE_OFFSET)
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
