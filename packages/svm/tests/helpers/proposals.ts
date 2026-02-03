import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { ProposalInstruction, TokenFee } from '../../sdks/settler/types'
import * as SettlerIDL from '../../target/idl/settler.json'
import { Settler } from '../../target/types/settler'
import { makeTxSignAndSend } from '../utils'
import { PROPOSAL_DEADLINE_OFFSET, TEST_DATA_HEX_3 } from './constants'
import { createValidatedIntent, IntentAccount, mapIntentFeesToTokenFees } from './intents'
import { getCurrentTimestamp, randomPubkey } from './misc'

export type InstructionAccount = {
  pubkey: PublicKey
  isSigner: boolean
  isWritable: boolean
}

export type CreateInstructionAccountOptions = Partial<InstructionAccount>

export type CreateProposalInstructionOptions = Partial<{
  programId: PublicKey
  accounts: Array<{
    pubkey: PublicKey
    isSigner: boolean
    isWritable: boolean
  }>
  data: string
}>

export type CreateProposalIntentOptions = Partial<{
  isFinal: boolean
  minValidations: number
  deadline: number
}>

export type CreateProposalOptions = Partial<{
  intentHash: string
  intentOptions: CreateProposalIntentOptions
  deadline: number
  deadlineOffset: number
  instructions: ProposalInstruction[]
  fees: TokenFee[]
  customFees: boolean
}>

export type ProposalWithIntent = {
  intentHash: string
  intent: IntentAccount
  deadline: number
  instructions: ProposalInstruction[]
  fees: TokenFee[]
}

/**
 * Create proposal params (intent, deadline, instructions, fees) for testing
 */
export async function createProposalParams(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  options: CreateProposalOptions = {}
): Promise<ProposalWithIntent> {
  const intentHash =
    options?.intentHash ||
    (await createValidatedIntent(solverSdk, solverProvider, client, { ...options.intentOptions }))

  const program = new Program<Settler>(SettlerIDL, solverProvider)

  const intent = await program.account.intent.fetch(solverSdk.getIntentKey(intentHash))

  const deadline = options?.deadline ?? getCurrentTimestamp(client, options?.deadlineOffset ?? PROPOSAL_DEADLINE_OFFSET)

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
 * Create a finalized proposal
 */
export async function createFinalizedProposal(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  client: LiteSVM,
  options: Partial<ProposalWithIntent> = {}
): Promise<{ intentHash: string; proposalKey: PublicKey }> {
  const { intentHash, deadline, instructions, fees } = await createProposalParams(
    solverSdk,
    solverProvider,
    client,
    options
  )

  const ix = await solverSdk.createProposalIx(intentHash, instructions, fees, deadline, true)
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
export function createTestProposalInstruction(options: CreateProposalInstructionOptions = {}): ProposalInstruction {
  return {
    programId: randomPubkey(),
    accounts: [],
    data: TEST_DATA_HEX_3,
    ...options,
  }
}

export function createInstructionAccount(options: CreateInstructionAccountOptions = {}): InstructionAccount {
  return {
    pubkey: randomPubkey(),
    isSigner: false,
    isWritable: false,
    ...options,
  }
}

export function createWritableInstructionAccount(): InstructionAccount {
  return createInstructionAccount({ isWritable: true })
}

export function createSignerInstructionAccount(): InstructionAccount {
  return createInstructionAccount({ isSigner: true, isWritable: true })
}
