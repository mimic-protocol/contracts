import { web3 } from '@coral-xyz/anchor'
import { randomHex } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm'

import { INTENT_DEADLINE_OFFSET, NONCE_LENGTH } from './constants'

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Generate a random 32-byte hex string for nonce
 */
export function generateNonce(): string {
  return randomHex(NONCE_LENGTH).slice(2)
}

/**
 * Get current timestamp with optional offset
 */
export function getCurrentDeadline(client: LiteSVM, offset: number = INTENT_DEADLINE_OFFSET): number {
  const now = Number(client.getClock().unixTimestamp)
  return now + offset
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
