import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers'

import { Account, randomAddress, randomHex, toAddress } from '../addresses'
import { MAX_UINT256 } from '../constants'
import { BigNumberish } from '../numbers'

export const MAX_FEE_TYPE_HASH = keccak256(toUtf8Bytes('MaxFee(address token,uint256 amount)'))

export const INTENT_TYPE_HASH = keccak256(
  toUtf8Bytes(
    'Intent(uint8 op,address user,address settler,bytes32 nonce,uint256 deadline,bytes data,MaxFee[] maxFees)MaxFee(address token,uint256 amount)'
  )
)

/* eslint-disable no-unused-vars */

export enum OpType {
  Swap,
  Transfer,
  Call,
}

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
  params = { ...getDefaults(), ...params }
  return {
    op: params.op,
    settler: toAddress(params.settler),
    user: toAddress(params.user),
    nonce: params.nonce,
    deadline: params.deadline.toString(),
    data: params.data || '0x',
    maxFees: params.maxFees || [],
  }
}

export function hashIntent(intent: Intent): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      [
        'bytes32', // type hash
        'uint8', // op
        'address', // user
        'address', // settler
        'bytes32', // nonce
        'uint256', // deadline
        'bytes32', // keccak256 of data
        'bytes32', // keccak256 of max fees
      ],
      [
        INTENT_TYPE_HASH,
        intent.op,
        toAddress(intent.user),
        toAddress(intent.settler),
        intent.nonce.toString(),
        intent.deadline.toString(),
        keccak256(intent.data),
        hashMaxFees(intent.maxFees),
      ]
    )
  )
}

export function hashMaxFees(maxFees: MaxFee[]): string {
  const feeHashes = maxFees.map(hashMaxFee)
  return keccak256('0x' + feeHashes.map((h) => h.slice(2)).join(''))
}

export function hashMaxFee(maxFee: MaxFee): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [MAX_FEE_TYPE_HASH, toAddress(maxFee.token), maxFee.amount.toString()]
    )
  )
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
