import {
  BigNumberish,
  hashIntent as hashRawIntent,
  Intent as RawIntent,
  MAX_UINT256,
  OpType,
  randomEvmAddress,
  randomHex,
  randomSig,
} from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses'

export type MaxFee = {
  token: Account
  amount: BigNumberish
}

export type IntentEvent = {
  topic: string
  data?: string
}

export type Intent = {
  op: OpType
  settler: Account
  user: Account
  nonce: string
  deadline: BigNumberish
  data: string
  maxFees: MaxFee[]
  events: IntentEvent[]
  configSig: string
  minValidations: number
  validations: string[]
}

export function createIntent(params?: Partial<Intent>): Intent {
  return { ...getDefaults(), ...params }
}

export function hashIntent(intent: Intent): string {
  return hashRawIntent(toRawIntent(intent))
}

function toRawIntent(intent: Intent): RawIntent {
  return {
    op: intent.op,
    user: toAddress(intent.user),
    settler: toAddress(intent.settler),
    nonce: intent.nonce.toString(),
    deadline: intent.deadline.toString(),
    data: intent.data,
    maxFees: intent.maxFees.map(({ token, amount }) => ({ token: toAddress(token), amount: amount.toString() })),
    events: intent.events.map(({ topic, data }) => ({ topic, data: data || '0x' })),
    configSig: intent.configSig,
    minValidations: intent.minValidations,
  }
}

function getDefaults(): Intent {
  return {
    op: OpType.Transfer,
    settler: randomEvmAddress(),
    user: randomEvmAddress(),
    nonce: randomHex(32),
    deadline: MAX_UINT256,
    data: '0x',
    maxFees: [],
    events: [],
    configSig: randomSig(),
    minValidations: 0,
    validations: [],
  }
}
