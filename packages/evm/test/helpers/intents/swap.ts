import { BigNumberish, encodeSwapIntent, OpType, SwapIntentData } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { createIntent, Intent } from './base'

export type SwapIntent = Intent & {
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

export function createSwapIntent(params?: Partial<SwapIntent>): Intent {
  const intent = createIntent({ ...params, op: OpType.Swap })
  const swapIntent = { ...getDefaults(), ...params, ...intent } as SwapIntent
  intent.data = encodeSwapIntent(toSwapIntentData(swapIntent))
  return intent
}

function toSwapIntentData(intent: SwapIntent): SwapIntentData {
  return {
    sourceChain: intent.sourceChain.toString(),
    destinationChain: intent.destinationChain.toString(),
    tokensIn: toArray(intent.tokensIn).map(({ token, amount }) => ({
      token: toAddress(token),
      amount: amount.toString(),
    })),
    tokensOut: toArray(intent.tokensOut).map(({ token, minAmount, recipient }) => ({
      token: toAddress(token),
      minAmount: minAmount.toString(),
      recipient: toAddress(recipient),
    })),
  }
}

function getDefaults(): Partial<SwapIntent> {
  return {
    sourceChain: 31337,
    destinationChain: 31337,
    tokensIn: [],
    tokensOut: [],
  }
}
