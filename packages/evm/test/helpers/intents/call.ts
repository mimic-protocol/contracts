import { AbiCoder } from 'ethers'

import { Account, randomAddress, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { BigNumberish, fp } from '../numbers'
import { createIntent, Intent, OpType } from './base'

export type CallIntent = Intent & {
  calls: NAry<CallData>
  feeToken: Account
  feeAmount: BigNumberish
}

export interface CallData {
  target: Account
  data: string
  value: BigNumberish
}

export function createCallIntent(params?: Partial<CallIntent>): Intent {
  const intent = createIntent({ ...params, op: OpType.Call })
  intent.data = encodeCallIntent({ ...getDefaults(), ...params, ...intent })
  return intent
}

function encodeCallIntent(intent: Partial<CallIntent>): string {
  const CALLS = 'tuple(address,bytes,uint256)[]'
  return AbiCoder.defaultAbiCoder().encode(
    [`tuple(${CALLS},address,uint256)`],
    [
      [
        toArray(intent.calls).map((callData: CallData) => [
          toAddress(callData.target),
          callData.data,
          callData.value.toString(),
        ]),
        toAddress(intent.feeToken),
        intent.feeAmount.toString(),
      ],
    ]
  )
}

function getDefaults(): Partial<CallIntent> {
  return {
    calls: [],
    feeToken: randomAddress(),
    feeAmount: fp(0.05),
  }
}
