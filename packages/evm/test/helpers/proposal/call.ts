import { createProposal, Proposal } from './base'

export function createCallProposal(params?: Partial<Proposal>): Proposal {
  return createProposal({ ...params, data: '0x' })
}
