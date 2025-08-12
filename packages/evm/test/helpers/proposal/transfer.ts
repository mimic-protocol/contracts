import { createProposal, Proposal } from './base'

export function createTransferProposal(params?: Partial<Proposal>): Proposal {
  return createProposal(params)
}
