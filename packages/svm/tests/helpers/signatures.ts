import { Chains, PROPOSAL_712_TYPE_SVM, SETTLER_EIP712_DOMAIN, Signer, ValidatorSigner } from '@mimicprotocol/sdk'
import { ethers } from 'ethers'

import { ProposalAccount } from './proposals'

export type ParsedSignature = { signature: Uint8Array; recoveryId: number }

/**
 * Create an EIP712 signature for a validator (signs intent hash)
 */
export async function createValidatorSignature(intentHash: string, signer: Signer): Promise<ParsedSignature> {
  const validator = new ValidatorSigner(signer)
  const signature = await validator.signIntentHash({
    chainId: Chains.Solana,
    settler: '', // this is ignored for SVM
    hash: intentHash,
  })

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

  const signature = await axia.signTypedData(domain, PROPOSAL_712_TYPE_SVM, values)

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
