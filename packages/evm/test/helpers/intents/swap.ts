import { AbiCoder } from 'ethers'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { BigNumberish } from '../numbers'
import { createIntent, Intent, OpType } from './base'

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
  intent.data = encodeSwapIntent({ ...getDefaults(), ...params, ...intent })
  return intent
}

export function encodeSwapIntent(intent: Partial<SwapIntent>): string {
  const TOKENS_IN = 'tuple(address,uint256)[]'
  const TOKENS_OUT = 'tuple(address,uint256,address)[]'
  return AbiCoder.defaultAbiCoder().encode(
    [`tuple(uint256,uint256,${TOKENS_IN},${TOKENS_OUT})`],
    [
      [
        intent.sourceChain,
        intent.destinationChain,
        toArray(intent.tokensIn).map((tokenIn: TokenIn) => [toAddress(tokenIn.token), tokenIn.amount.toString()]),
        toArray(intent.tokensOut).map((tokenOut: TokenOut) => [
          toAddress(tokenOut.token),
          tokenOut.minAmount.toString(),
          toAddress(tokenOut.recipient),
        ]),
      ],
    ]
  )
}

function getDefaults(): Partial<SwapIntent> {
  return {
    sourceChain: 31337,
    destinationChain: 31337,
    tokensIn: [],
    tokensOut: [],
  }
}
