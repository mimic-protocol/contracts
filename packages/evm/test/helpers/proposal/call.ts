import { AbiCoder } from 'ethers'

import { BigNumberish, fp } from '../numbers'
import { createProposal, Proposal } from './base'

export type CallProposal = Proposal & {
  feeAmount: BigNumberish
}

export function createCallProposal(params?: Partial<CallProposal>): Proposal {
  const proposal = createProposal(params)
  proposal.data = encodeCallProposal({ ...getDefaults(), ...params, ...proposal })
  return proposal
}

function encodeCallProposal(proposal: Partial<CallProposal>): string {
  return AbiCoder.defaultAbiCoder().encode(['tuple(uint256)'], [[proposal.feeAmount.toString()]])
}

function getDefaults(): Partial<CallProposal> {
  return {
    feeAmount: fp(0.1),
  }
}
