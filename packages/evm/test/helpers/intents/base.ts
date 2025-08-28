import {
  BigNumberish,
  encodeIntent,
  Intent as RawIntent,
  MAX_UINT256,
  OpType,
  randomAddress,
  randomHex,
} from '@mimicprotocol/sdk'
import { keccak256 } from 'ethers'

import { Account, toAddress } from '../addresses'

export type MaxFee = {
  token: Account
  amount: BigNumberish
}

export type Intent = {
  op: OpType
  settler: Account
  user: Account
  nonce: string
  deadline: BigNumberish
  data: string
  maxFees: MaxFee[]
}

export function createIntent(params?: Partial<Intent>): Intent {
  return { ...getDefaults(), ...params }
}

export function hashIntent(intent: Intent): string {
  return keccak256(encodeIntent(toRawIntent(intent)))
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
  }
}

function getDefaults(): Intent {
  return {
    op: OpType.Transfer,
    settler: randomAddress(),
    user: randomAddress(),
    nonce: randomHex(32),
    deadline: MAX_UINT256,
    data: '0x',
    maxFees: [],
  }
}
