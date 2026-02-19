import { web3 } from '@coral-xyz/anchor'

export type TokenFee = {
  mint: web3.PublicKey
  amount: number
}

export type IntentEvent = {
  topicHex: string
  dataHex: string
}

export const OpType = {
  Transfer: 0,
  Swap: 1,
  Call: 2,
} as const

export type OpType = (typeof OpType)[keyof typeof OpType]

export type CreateIntentParams = {
  op: OpType
  user: web3.PublicKey
  nonceHex: string
  deadline: number
  minValidations: number
  dataHex: string
  maxFees: TokenFee[]
  eventsHex: IntentEvent[]
}

export type ExtendIntentParams = {
  moreDataHex?: string
  moreMaxFees?: TokenFee[]
  moreEventsHex?: IntentEvent[]
}

export type CreateProposalParams = {
  instructions: ProposalInstruction[]
  fees: TokenFee[]
  deadline: number
  isFinal?: boolean
}

export type ProposalInstructionAccountMeta = {
  pubkey: web3.PublicKey
  isSigner: boolean
  isWritable: boolean
}

export type ProposalInstruction = {
  programId: web3.PublicKey
  accounts: ProposalInstructionAccountMeta[]
  data: Buffer | string
}

export type SolanaEip712Domain = {
  name?: string
  version?: string
  chainId?: number
  salt?: Uint8Array
}
