import { encodeMultiIntent, IntentEvent, MultiIntentData, OpType, ZERO_BYTES32 } from '@mimicprotocol/sdk'

import { toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { createIntent, Intent } from './base'

export type MultiIntent = Intent & {
  intents: NAry<Intent>
}

export function createMultiIntent(params?: Partial<MultiIntent>): Intent {
  const intent = createIntent({ ...params, op: OpType.Multi })
  const multiIntent = { ...getDefaults(), ...params, ...intent } as MultiIntent
  intent.data = encodeMultiIntent(toMultiIntentData(multiIntent))
  return intent
}

function toMultiIntentData(intent: MultiIntent): MultiIntentData {
  return {
    intents: toArray(intent.intents).map((i: Intent) => ({
      op: i.op,
      settler: toAddress(i.settler),
      user: toAddress(i.user),
      nonce: ZERO_BYTES32,
      deadline: '0',
      data: i.data,
      maxFees: [],
      events: toArray(i.events).map((e: IntentEvent) => ({ data: e.data.toString(), topic: e.topic.toString() })),
      configSig: ZERO_BYTES32,
      minValidations: 0,
    })),
  }
}

function getDefaults(): Partial<MultiIntent> {
  return {
    intents: [],
  }
}
