import { web3 } from '@coral-xyz/anchor'

export type TokenFee = {
  mint: web3.PublicKey
  amount: number
}

export type IntentEvent = {
  topicHex: string
  dataHex: string
}

export enum OpType {
  // eslint-disable-next-line no-unused-vars
  Transfer = 1,
  // eslint-disable-next-line no-unused-vars
  Swap = 2,
  // eslint-disable-next-line no-unused-vars
  Call = 3,
}

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
