import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers'

import { Account, randomAddress, randomHex, toAddress } from '../addresses'
import { MAX_UINT256 } from '../constants'
import { BigNumberish } from '../numbers'

export const INTENT_TYPE_HASH = keccak256(
  toUtf8Bytes('Intent(uint8 op,address user,address settler,bytes32 nonce,uint256 deadline,bytes data)')
)

/* eslint-disable no-unused-vars */

export enum OpType {
  Swap,
  Transfer,
  Call,
}

export type Intent = {
  op: OpType
  settler: Account
  user: Account
  nonce: string
  deadline: BigNumberish
  data: string
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
  }
}

export function encodeIntent(intent: Intent): string {
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
      ],
      [
        INTENT_TYPE_HASH,
        intent.op,
        toAddress(intent.user),
        toAddress(intent.settler),
        intent.nonce.toString(),
        intent.deadline.toString(),
        keccak256(intent.data),
      ]
    )
  )
}

function getDefaults(): Intent {
  return {
    op: OpType.Swap,
    settler: randomAddress(),
    user: randomAddress(),
    nonce: randomHex(32),
    deadline: MAX_UINT256,
    data: '0x',
  }
}
