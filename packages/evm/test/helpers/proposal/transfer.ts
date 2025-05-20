import { AbiCoder } from 'ethers'

import { BigNumberish, fp } from '../numbers'
import { createProposal, Proposal } from './base'

export type TransferProposal = Proposal & {
  feeAmount: BigNumberish
}

export function createTransferProposal(params?: Partial<TransferProposal>): Proposal {
  const proposal = createProposal(params)
  proposal.data = encodeTransferProposal({ ...getDefaults(), ...params, ...proposal })
  return proposal
}

function encodeTransferProposal(proposal: Partial<TransferProposal>): string {
  return AbiCoder.defaultAbiCoder().encode(['tuple(uint256)'], [[proposal.feeAmount.toString()]])
}

function getDefaults(): Partial<TransferProposal> {
  return {
    feeAmount: fp(0.1),
  }
}
