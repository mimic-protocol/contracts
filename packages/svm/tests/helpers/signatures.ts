import { signAsync } from '@noble/ed25519'
import { Keypair, PublicKey } from '@solana/web3.js'

/**
 * Create an Ed25519 signature for a validator (signs intent hash)
 */
export async function createValidatorSignature(intentHash: string, validator: Keypair): Promise<number[]> {
  const signature = await signAsync(Buffer.from(intentHash, 'hex'), validator.secretKey.slice(0, 32))
  return Array.from(new Uint8Array(signature))
}

/**
 * Create an Ed25519 signature for an axia (signs proposal key)
 */
export async function createAxiaSignature(proposalKey: PublicKey, axia: Keypair): Promise<number[]> {
  const signature = await signAsync(proposalKey.toBuffer(), axia.secretKey.slice(0, 32))
  return Array.from(new Uint8Array(signature))
}
