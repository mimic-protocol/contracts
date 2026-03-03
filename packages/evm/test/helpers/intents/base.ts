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

export type OperationEvent = {
  topic: string
  data?: string
}

export type Operation = {
  op: OpType
  user: Account
  data: string
  events: OperationEvent[]
}

export type Intent = {
  settler: Account
  user: Account
  nonce: string
  deadline: BigNumberish
  maxFees: MaxFee[]
  configSig: string
  minValidations: number
  validations: string[]
  operations: Operation[]
}

export function createIntent(params?: Partial<Intent>): Intent {
  return { ...getDefaults(), ...params }
}

export function createOperation(params?: Partial<Operation>): Operation {
  return { ...getOperationDefaults(), ...params }
}

export function hashIntent(intent: Intent): string {
  return hashRawIntent(toRawIntent(intent))
}

function toRawIntent(intent: Intent): RawIntent {
  return {
    user: toAddress(intent.user),
    settler: toAddress(intent.settler),
    nonce: intent.nonce.toString(),
    deadline: intent.deadline.toString(),
    maxFees: intent.maxFees.map(({ token, amount }) => ({ token: toAddress(token), amount: amount.toString() })),
    configSig: intent.configSig,
    minValidations: intent.minValidations,
    operations: intent.operations.map(({ op, user, data, events }) => ({
      op,
      user: toAddress(user),
      data,
      events: events.map(({ topic, data }) => ({ topic, data: data || '0x' })),
    })),
  }
}

function getOperationDefaults(): Operation {
  return {
    op: OpType.Transfer,
    user: randomEvmAddress(),
    data: '0x',
    events: [],
  }
}

function getDefaults(): Intent {
  const user = randomEvmAddress()
  return {
    settler: randomEvmAddress(),
    user,
    nonce: randomHex(32),
    deadline: MAX_UINT256,
    maxFees: [],
    configSig: randomSig(),
    minValidations: 0,
    validations: [],
    operations: [getOperationDefaults()],
  }
}
