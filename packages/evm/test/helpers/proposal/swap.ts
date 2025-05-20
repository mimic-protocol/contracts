import { Account, BigNumberish, NAry, randomAddress, toAddress, toArray } from '@mimic-fi/helpers'
import { ethers } from 'ethers'

import { createProposal, Proposal } from './base'

export type SwapProposal = Proposal & {
  executor: Account
  data: string
  amountsOut: NAry<BigNumberish>
}

export function createSwapProposal(params?: Partial<SwapProposal>): Proposal {
  const proposal = createProposal(params)
  proposal.data = encodeSwapProposal({ ...getDefaults(), ...params, ...proposal })
  return proposal
}

function encodeSwapProposal(proposal: Partial<SwapProposal>): string {
  return ethers.utils.defaultAbiCoder.encode(
    [`tuple(address,bytes,uint256[])`],
    [
      [
        toAddress(proposal.executor),
        proposal.data,
        toArray(proposal.amountsOut).map((amountOut) => amountOut.toString()),
      ],
    ]
  )
}

function getDefaults(): Partial<SwapProposal> {
  return {
    executor: randomAddress(),
    data: '0x',
    amountsOut: [],
  }
}
