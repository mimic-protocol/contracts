import {
  BigNumberish,
  hashProposal as hashRawProposal,
  MAX_UINT256,
  Proposal as RawProposal,
  PROPOSAL_712_TYPE,
  SETTLER_EIP712_DOMAIN,
} from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { Contract } from 'ethers'
import { network } from 'hardhat'

import { Account, toAddress } from '../addresses'
import { toArray } from '../arrays'
import { hashIntent, Intent } from '../intents'

export type Proposal = {
  deadline: BigNumberish
  data: string
  fees: BigNumberish[]
}

export async function signProposal(
  settler: Contract,
  intent: Intent,
  solver: Account,
  proposal: Proposal,
  signer: HardhatEthersSigner
): Promise<string> {
  const connection = await network.connect()
  const chainId = connection.networkConfig.chainId
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId, verifyingContract: settler.target }
  return signer.signTypedData(domain, PROPOSAL_712_TYPE, {
    intent: hashIntent(intent),
    solver: toAddress(solver),
    deadline: proposal.deadline,
    data: proposal.data,
    fees: proposal.fees,
  })
}

export function createProposal(params?: Partial<Proposal>): Proposal {
  return { ...getDefaults(), ...params }
}

export function hashProposal(proposal: Proposal, intent: Intent, solver: Account): string {
  return hashRawProposal(toRawProposal(proposal, solver), hashIntent(intent))
}

export function toRawProposal(proposal: Proposal, solver: Account): RawProposal {
  return {
    solver: toAddress(solver),
    deadline: proposal.deadline.toString(),
    data: proposal.data,
    fees: toArray(proposal.fees).map((fee) => fee.toString()),
  }
}

function getDefaults(): Proposal {
  return {
    deadline: MAX_UINT256,
    data: '0x',
    fees: [],
  }
}
