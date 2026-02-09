import { hexToBytes } from '@mimicprotocol/sdk'
import { PublicKey } from '@solana/web3.js'
import { ethers } from 'ethers'

/**
 * Create a Secp256k1 signature for a validator (signs intent hash)
 * Uses Ethereum's signMessage which adds the standard prefix
 */
export async function createValidatorSignature(
  intentHash: string,
  validator: ethers.HDNodeWallet | ethers.Wallet
): Promise<{ signature: number[]; recoveryId: number }> {
  const messageHash = hexToBytes(intentHash)
  if (messageHash.length !== 32) {
    throw new Error(`Intent hash must be 32 bytes, got ${messageHash.length}`)
  }

  // Sign with Ethereum's signMessage (adds prefix automatically)
  const fullSignature = await validator.signMessage(messageHash)
  const fullSigBytes = ethers.getBytes(fullSignature)

  // Extract signature (64 bytes) and recovery ID
  const signature = Array.from(fullSigBytes.slice(0, 64))
  const recoveryId = fullSigBytes[64] - 27 // Adjust from Ethereum's 27-30 range to 0-3

  return { signature, recoveryId }
}

/**
 * Create a Secp256k1 signature for an axia (signs proposal key)
 * Uses Ethereum's signMessage which adds the standard prefix
 */
export async function createAxiaSignature(
  proposalKey: PublicKey,
  axia: ethers.HDNodeWallet | ethers.Wallet
): Promise<{ signature: number[]; recoveryId: number }> {
  const message = proposalKey.toBuffer()
  if (message.length !== 32) {
    throw new Error(`Proposal key must be 32 bytes, got ${message.length}`)
  }

  // Sign with Ethereum's signMessage (adds prefix automatically)
  const fullSignature = await axia.signMessage(message)
  const fullSigBytes = ethers.getBytes(fullSignature)

  // Extract signature (64 bytes) and recovery ID
  const signature = Array.from(fullSigBytes.slice(0, 64))
  const recoveryId = fullSigBytes[64] - 27 // Adjust from Ethereum's 27-30 range to 0-3

  return { signature, recoveryId }
}

export function ethAddressToByteArray(address: string): number[] {
  return Array.from(Buffer.from(address.slice(2), 'hex'))
}
