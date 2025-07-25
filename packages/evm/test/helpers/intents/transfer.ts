import { AbiCoder } from 'ethers'

import { Account, randomAddress, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { BigNumberish, fp } from '../numbers'
import { createIntent, Intent, OpType } from './base'

export type TransferIntent = Intent & {
  chainId: BigNumberish
  transfers: NAry<TransferData>
  feeToken: Account
  feeAmount: BigNumberish
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
    [`tuple(uint256,${TRANSFERS},address,uint256)`],
    [
      [
        intent.chainId,
        toArray(intent.transfers).map((transferData: TransferData) => [
          toAddress(transferData.token),
          transferData.amount.toString(),
          toAddress(transferData.recipient),
        ]),
        toAddress(intent.feeToken),
        intent.feeAmount.toString(),
      ],
    ]
  )
}

function getDefaults(): Partial<TransferIntent> {
  return {
    chainId: 31337,
    transfers: [],
    feeToken: randomAddress(),
    feeAmount: fp(0.05),
  }
}
