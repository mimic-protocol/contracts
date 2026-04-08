import { createProposal, Proposal } from './base'

export function createDynamicCallProposal(params?: Partial<Proposal>): Proposal {
  return createProposal(params)
}
