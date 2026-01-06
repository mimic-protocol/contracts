import { web3 } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import { FailedTransactionMetadata, TransactionMetadata } from 'litesvm'

import SettlerSDK from '../../sdks/settler/Settler'
import { CreateIntentParams, IntentEvent, OpType, TokenFee } from '../../sdks/settler/types'
import { makeTxSignAndSend } from '../utils'
import {
  DEFAULT_DATA_HEX,
  DEFAULT_EVENT_DATA_HEX,
  DEFAULT_MAX_FEE,
  DEFAULT_MIN_VALIDATIONS,
  DEFAULT_TOPIC_HEX,
  INTENT_DEADLINE_OFFSET,
  INTENT_HASH_LENGTH,
  NONCE_LENGTH,
} from './constants'

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Generate a random 32-byte hex string for intent hash
 */
export function generateIntentHash(): string {
  return randomHex(INTENT_HASH_LENGTH).slice(2)
}

/**
 * Generate a random 32-byte hex string for nonce
 */
export function generateNonce(): string {
  return randomHex(NONCE_LENGTH).slice(2)
}

/**
 * Create a test intent with configurable parameters
 */
export async function createTestIntent(
  solverSdk: SettlerSDK,
  solverProvider: LiteSVMProvider,
  options: {
    intentHash?: string
    nonce?: string
    user?: PublicKey
    deadline?: number
    op?: OpType
    minValidations?: number
    dataHex?: string
    maxFees?: TokenFee[]
    eventsHex?: IntentEvent[]
    isFinal?: boolean
  } = {}
): Promise<string> {
  const intentHash = options.intentHash || generateIntentHash()
  const nonce = options.nonce || generateNonce()
  const user = options.user || Keypair.generate().publicKey
  const client = solverProvider.client
  const now = Number(client.getClock().unixTimestamp)
  const deadline = options.deadline ?? now + INTENT_DEADLINE_OFFSET

  const params: CreateIntentParams = {
    op: options.op || OpType.Transfer,
    user,
    nonceHex: nonce,
    deadline,
    minValidations: options.minValidations ?? DEFAULT_MIN_VALIDATIONS,
    dataHex: options.dataHex ?? DEFAULT_DATA_HEX,
    maxFees: options.maxFees || [
      {
        mint: Keypair.generate().publicKey,
        amount: DEFAULT_MAX_FEE,
      },
    ],
    eventsHex: options.eventsHex || [
      {
        topicHex: DEFAULT_TOPIC_HEX,
        dataHex: DEFAULT_EVENT_DATA_HEX,
      },
    ],
  }

  const ix = await solverSdk.createIntentIx(intentHash, params, options.isFinal ?? false)
  const res = await makeTxSignAndSend(solverProvider, ix)
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`Failed to create intent: ${res.toString()}`)
  }
  return intentHash
}

/**
 * Helper to expect transaction errors consistently
 */
export function expectTransactionError(
  res: TransactionMetadata | FailedTransactionMetadata | string,
  expectedMessage: string
): void {
  expect(typeof res).to.not.be.eq('TransactionMetadata')

  if (typeof res === 'string') {
    expect(res).to.include(expectedMessage)
  } else {
    expect(res.toString()).to.include(expectedMessage)
  }
}

export function toLamports(sol: number): bigint {
  return BigInt(sol * LAMPORTS_PER_SOL)
}

export function randomKeypair(): web3.Keypair {
  return web3.Keypair.generate()
}

export function randomPubkey(): web3.PublicKey {
  return randomKeypair().publicKey
}
