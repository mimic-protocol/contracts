import { web3 } from '@coral-xyz/anchor'
import { expect } from 'chai'
import { FailedTransactionMetadata, TransactionMetadata } from 'litesvm'

export const LAMPORTS_PER_SOL = 1_000_000_000

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
