import { BigNumberish, encodeTransferIntent, OpType, TransferIntentData } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { createIntent, Intent } from './base'

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
  const transferIntent = { ...getDefaults(), ...params, ...intent } as TransferIntent
  intent.data = encodeTransferIntent(toTransferIntentData(transferIntent))
  return intent
}

function toTransferIntentData(intent: TransferIntent): TransferIntentData {
  return {
    chainId: intent.chainId.toString(),
    transfers: toArray(intent.transfers).map((transfer) => ({
      token: toAddress(transfer.token),
      amount: transfer.amount.toString(),
      recipient: toAddress(transfer.recipient),
    })),
  }
}

function getDefaults(): Partial<TransferIntent> {
  return {
    chainId: 31337,
    transfers: [],
  }
}
