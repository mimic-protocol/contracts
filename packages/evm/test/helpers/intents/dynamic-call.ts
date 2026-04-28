import { OpType } from '@mimicprotocol/sdk'
import { AbiCoder, BigNumberish } from 'ethers'

import { Account, toAddress } from '../addresses.js'
import { DynamicArg } from '../dynamic-calls.js'
import { createIntent, createOperation, Intent, Operation } from './base.js'

export type DynamicCallOperation = Operation & {
  chainId: BigNumberish
  calls: DynamicCallData[]
}

export interface DynamicCallData {
  target: Account
  value?: BigNumberish
  selector: string
  arguments: DynamicArg[]
}

export function createDynamicCallIntent(
  intentParams?: Partial<Intent>,
  operationParams?: Partial<DynamicCallOperation>
): Intent {
  const intent = createIntent({ ...intentParams })
  const operation = createDynamicCallOperation({ ...operationParams })
  intent.operations = [operation]
  return intent
}

export function createDynamicCallOperation(params?: Partial<DynamicCallOperation>): Operation {
  const operation = createOperation({ ...params, opType: OpType.EvmDynamicCall })
  const dynamicCallOperation = { ...getDefaults(), ...params, ...operation } as DynamicCallOperation
  operation.data = AbiCoder.defaultAbiCoder().encode(
    ['tuple(uint256 chainId, bytes[] calls)'],
    [toDynamicCallOperationData(dynamicCallOperation)]
  )
  return operation
}

function toDynamicCallOperationData(operation: DynamicCallOperation) {
  return {
    chainId: operation.chainId.toString(),
    calls: operation.calls.map((call) => encodeDynamicCallData(call)),
  }
}

function getDefaults(): Partial<DynamicCallOperation> {
  return {
    chainId: 31337,
    calls: [],
  }
}

function encodeDynamicCallData(call: DynamicCallData): string {
  return AbiCoder.defaultAbiCoder().encode(
    [
      'tuple(address target, uint256 value, bytes4 selector, tuple(uint8 kind, bytes data, bool isDynamic)[] arguments)',
    ],
    [
      {
        target: toAddress(call.target),
        value: (call.value || 0).toString(),
        selector: call.selector,
        arguments: call.arguments,
      },
    ]
  )
}
