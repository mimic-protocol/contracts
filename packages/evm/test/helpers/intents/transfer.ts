import { AbiCoder } from 'ethers'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { BigNumberish } from '../numbers'
import { createIntent, Intent, OpType } from './base'

export type TransferIntent = Intent & {
  chainId: BigNumberish
  transfers: NAry<TransferData>
}

export interface TransferData {
  token: Account
  amount: BigNumberish
  recipient: Account
}

export function createTransferIntent(params?: Partial<TransferIntent>): Intent {
  const intent = createIntent({ ...params, op: OpType.Transfer })
  intent.data = encodeTransferIntent({ ...getDefaults(), ...params, ...intent })
  return intent
}

function encodeTransferIntent(intent: Partial<TransferIntent>): string {
  const TRANSFERS = 'tuple(address,uint256,address)[]'
  return AbiCoder.defaultAbiCoder().encode(
    [`tuple(uint256,${TRANSFERS})`],
    [
      [
        intent.chainId,
        toArray(intent.transfers).map((transferData: TransferData) => [
          toAddress(transferData.token),
          transferData.amount.toString(),
          toAddress(transferData.recipient),
        ]),
      ],
    ]
  )
}

function getDefaults(): Partial<TransferIntent> {
  return {
    chainId: 31337,
    transfers: [],
  }
}
