import { BigNumberish, encodeTransferOperation, OpType, TransferOperationData } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses.js'
import { NAry, toArray } from '../arrays.js'
import { createIntent, createOperation, Intent, Operation } from './base.js'

export type TransferOperation = Operation & {
  chainId: BigNumberish
  transfers: NAry<TransferData>
}

export interface TransferData {
  token: Account
  amount: BigNumberish
  recipient: Account
}

export function createTransferIntent(
  intentParams?: Partial<Intent>,
  operationParams?: Partial<TransferOperation>
): Intent {
  const intent = createIntent({ ...intentParams })
  const operation = createTransferOperation({ ...operationParams })
  intent.operations = [operation]
  return intent
}

export function createTransferOperation(params?: Partial<TransferOperation>): Operation {
  const operation = createOperation({ ...params, opType: OpType.Transfer })
  const transferOperation = { ...getDefaults(), ...params, ...operation } as TransferOperation
  operation.data = encodeTransferOperation(toTransferOperationData(transferOperation))
  return operation
}

function toTransferOperationData(intent: TransferOperation): TransferOperationData {
  return {
    chainId: Number(intent.chainId.toString()),
    transfers: toArray(intent.transfers).map((transfer) => ({
      token: toAddress(transfer.token),
      amount: transfer.amount.toString(),
      recipient: toAddress(transfer.recipient),
    })),
  }
}

function getDefaults(): Partial<TransferOperation> {
  return {
    chainId: 31337,
    transfers: [],
  }
}
