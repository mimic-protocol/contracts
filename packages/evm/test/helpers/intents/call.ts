import { BigNumberish, CallIntentData, encodeCallIntent, OpType } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { createIntent, Intent } from './base'

export type CallIntent = Intent & {
  chainId: BigNumberish
  calls: NAry<CallData>
}

export interface CallData {
  target: Account
  data?: string
  value?: BigNumberish
}

export function createCallIntent(params?: Partial<CallIntent>): Intent {
  const intent = createIntent({ ...params, op: OpType.Call })
  const callIntent = { ...getDefaults(), ...params, ...intent } as CallIntent
  intent.data = encodeCallIntent(toCallIntentData(callIntent))
  return intent
}

function toCallIntentData(intent: CallIntent): CallIntentData {
  return {
    chainId: intent.chainId,
    calls: toArray(intent.calls).map((callData: CallData) => ({
      target: toAddress(callData.target),
      data: callData.data || '0x',
      value: (callData.value || '0').toString(),
    })),
  }
}

function getDefaults(): Partial<CallIntent> {
  return {
    chainId: 31337,
    calls: [],
  }
}
