import { Chains, INTENT_HASH_VALIDATION_712_TYPES, SETTLER_EIP712_DOMAIN, Signer, ValidatorSigner } from '@mimicprotocol/sdk'
import { PublicKey } from '@solana/web3.js'
import { ethers } from 'ethers'

/**
 * Create an EIP712 signature for a validator (signs intent hash)
 */
export async function createValidatorSignature(
  intentHash: string,
  validator: ethers.HDNodeWallet
): Promise<{ signature: Uint8Array; recoveryId: number }> {
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId: Chains.Solana }
  const signature = await validator.signTypedData(domain, INTENT_HASH_VALIDATION_712_TYPES, { intent: intentHash })
  const parsedSignature = ethers.Signature.from(signature)
  return {
    signature: ethers.getBytes(parsedSignature.r + parsedSignature.s.slice(2)),
    recoveryId: parsedSignature.v - 27,
  }
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
