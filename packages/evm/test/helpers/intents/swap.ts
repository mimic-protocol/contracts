import { BigNumberish, encodeSwapOperation, OpType, SwapOperationData } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses.js'
import { NAry, toArray } from '../arrays.js'
import { createIntent, createOperation, Intent, Operation } from './base.js'

export type SwapOperation = Operation & {
  sourceChain: number
  destinationChain: number
  tokensIn: NAry<TokenIn>
  tokensOut: NAry<TokenOut>
}

export interface TokenIn {
  token: Account
  amount: BigNumberish
}

export interface TokenOut {
  token: Account
  minAmount: BigNumberish
  recipient: Account
}

export function createSwapIntent(intentParams?: Partial<Intent>, operationParams?: Partial<SwapOperation>): Intent {
  const intent = createIntent({ ...intentParams })
  const operation = createSwapOperation({ ...operationParams })
  intent.operations = [operation]
  return intent
}

export function createSwapOperation(params?: Partial<SwapOperation>): Operation {
  const operation = createOperation({ ...params, opType: OpType.Swap })
  const swapOperation = { ...getDefaults(), ...params, ...operation } as SwapOperation
  operation.data = encodeSwapOperation(toSwapOperationData(swapOperation))
  return operation
}

function toSwapOperationData(operation: SwapOperation): SwapOperationData {
  return {
    sourceChain: operation.sourceChain,
    destinationChain: operation.destinationChain,
    tokensIn: toArray(operation.tokensIn).map(({ token, amount }) => ({
      token: toAddress(token),
      amount: amount.toString(),
    })),
    tokensOut: toArray(operation.tokensOut).map(({ token, minAmount, recipient }) => ({
      token: toAddress(token),
      minAmount: minAmount.toString(),
      recipient: toAddress(recipient),
    })),
  }
}

function getDefaults(): Partial<SwapOperation> {
  return {
    sourceChain: 31337,
    destinationChain: 31337,
    tokensIn: [],
    tokensOut: [],
  }
}
