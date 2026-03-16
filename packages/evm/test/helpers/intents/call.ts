import {
  BigNumberish,
  encodeEvmCallOperation,
  EvmCallOperationData as CallOperationData,
  OpType,
} from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses.js'
import { NAry, toArray } from '../arrays.js'
import { createIntent, createOperation, Intent, Operation } from './base.js'

export type CallOperation = Operation & {
  chainId: BigNumberish
  calls: NAry<CallData>
}

export interface CallData {
  target: Account
  data?: string
  value?: BigNumberish
}

export function createCallIntent(intentParams?: Partial<Intent>, operationParams?: Partial<CallOperation>): Intent {
  const intent = createIntent({ ...intentParams })
  const operation = createCallOperation({ ...operationParams })
  intent.operations = [operation]
  return intent
}

export function createCallOperation(params?: Partial<CallOperation>): Operation {
  const operation = createOperation({ ...params, opType: OpType.EvmCall })
  const callOperation = { ...getDefaults(), ...params, ...operation } as CallOperation
  operation.data = encodeEvmCallOperation(toCallOperationData(callOperation))
  return operation
}

function toCallOperationData(intent: CallOperation): CallOperationData {
  return {
    chainId: Number(intent.chainId.toString()),
    calls: toArray(intent.calls).map((callData: CallData) => ({
      target: toAddress(callData.target),
      data: callData.data || '0x',
      value: (callData.value || '0').toString(),
    })),
  }
}

function getDefaults(): Partial<CallOperation> {
  return {
    chainId: 31337,
    calls: [],
  }
}
