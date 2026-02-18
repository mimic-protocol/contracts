import { encodeMultiProposal, MultiProposalData } from '@mimicprotocol/sdk'

import { NAry, toArray } from '../arrays.js'
import { createProposal, Proposal } from './base.js'

export type MultiProposal = Proposal & {
  proposals: NAry<Proposal>
}

export function createMultiProposal(params?: Partial<MultiProposal>): Proposal {
  const proposal = createProposal(params)
  const multiProposal = { ...getDefaults(), ...params, ...proposal } as MultiProposal
  proposal.data = encodeMultiProposal(toMultiProposalData(multiProposal))
  return proposal
}

function toMultiProposalData(proposal: MultiProposal): MultiProposalData {
  return {
    proposals: toArray(proposal.proposals).map((p) => ({
      data: p.data,
      deadline: p.deadline.toString(),
      fees: p.fees.map((f) => f.toString()),
    })),
  }
}

function getDefaults(): Partial<MultiProposal> {
  return {
    proposals: [],
  }
}
