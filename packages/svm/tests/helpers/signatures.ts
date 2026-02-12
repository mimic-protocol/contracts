import { Chains, INTENT_HASH_VALIDATION_712_TYPES, SETTLER_EIP712_DOMAIN } from '@mimicprotocol/sdk'
import { ethers } from 'ethers'

import { PROPOSAL_712_TYPE } from '../../sdks/settler/Settler'
import { ProposalAccount } from './proposals'

export type ParsedSignature = { signature: Uint8Array; recoveryId: number }

/**
 * Create an EIP712 signature for a validator (signs intent hash)
 */
export async function createValidatorSignature(
  intentHash: string,
  validator: ethers.HDNodeWallet
): Promise<ParsedSignature> {
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId: Chains.Solana }
  const signature = await validator.signTypedData(domain, INTENT_HASH_VALIDATION_712_TYPES, { intent: intentHash })

  return eip712SignatureToParsedSignature(signature)
}

/**
 * Create an EIP712 signature for Axia (signs Proposal)
 */
export async function createAxiaSignature(
  intentHash: number[],
  proposal: ProposalAccount,
  axia: ethers.HDNodeWallet
): Promise<ParsedSignature> {
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId: Chains.Solana }

  const values = {
    intent: Buffer.from(intentHash),
    solver: proposal.creator.toString(),
    deadline: proposal.deadline.toString(),
    data: '0x', // TODO
    fees: proposal.fees.map((fee) => fee.amount.toString()),
  }

  const signature = await axia.signTypedData(domain, PROPOSAL_712_TYPE, values)

  return eip712SignatureToParsedSignature(signature)
}

export function eip712SignatureToParsedSignature(signature: string): ParsedSignature {
  const parsedSignature = ethers.Signature.from(signature)

  return {
    signature: ethers.getBytes(parsedSignature.r + parsedSignature.s.slice(2)),
    recoveryId: parsedSignature.v - 27,
  }
}

export function ethAddressToByteArray(address: string): number[] {
  return Array.from(Buffer.from(address.slice(2), 'hex'))
}
