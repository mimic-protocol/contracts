import { BigNumberish, encodeSwapProposal, randomEvmAddress, SwapProposalData } from '@mimicprotocol/sdk'

import { Account, toAddress } from '../addresses'
import { NAry, toArray } from '../arrays'
import { createProposal, Proposal } from './base'

export type SwapProposal = Proposal & {
  executor: Account
  executorData: string
  amountsOut: NAry<BigNumberish>
}

export function createSwapProposal(params?: Partial<SwapProposal>): Proposal {
  const proposal = createProposal(params)
  const swapProposal = { ...getDefaults(), ...params, ...proposal } as SwapProposal
  proposal.data = encodeSwapProposal(toSwapProposalData(swapProposal))
  return proposal
}

function toSwapProposalData(proposal: SwapProposal): SwapProposalData {
  return {
    executor: toAddress(proposal.executor),
    executorData: proposal.executorData,
    amountsOut: toArray(proposal.amountsOut).map((amountOut) => amountOut.toString()),
  }
}

function getDefaults(): Partial<SwapProposal> {
  return {
    executor: randomEvmAddress(),
    executorData: '0x',
    amountsOut: [],
  }
}
