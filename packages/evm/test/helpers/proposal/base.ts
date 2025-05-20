import { Account, BigNumberish, MAX_UINT256, toAddress } from '@mimic-fi/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { Contract, ethers } from 'ethers'

import { encodeIntent, Intent } from '../intents'

export const DOMAIN_NAME_DEFAULTS = { name: 'Mimic Protocol Settler', version: '1' }

export const PROPOSAL_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('Proposal(bytes32 intent,address solver,uint256 deadline,bytes data)')
)
export const PROPOSAL_TYPE = {
  Proposal: [
    { name: 'intent', type: 'bytes32' },
    { name: 'solver', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
}

export type Proposal = {
  deadline: BigNumberish
  data: string
}

export async function signProposal(
  settler: Contract,
  intent: Intent,
  solver: Account,
  proposal: Proposal,
  signer: SignerWithAddress
): Promise<string> {
  const chainId = settler.provider._network.chainId
  const domain = { ...DOMAIN_NAME_DEFAULTS, chainId, verifyingContract: settler.address }
  return signer._signTypedData(domain, PROPOSAL_TYPE, {
    intent: encodeIntent(intent),
    solver: toAddress(solver),
    deadline: proposal.deadline,
    data: proposal.data,
  })
}

export function encodeProposal(proposal: Proposal, intent: Intent, solver: Account): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        'bytes32', // type hash
        'bytes32', // intent hash
        'address', // solver
        'uint256', // deadline
        'bytes32', // keccak256 of data
      ],
      [
        PROPOSAL_TYPE_HASH,
        encodeIntent(intent),
        toAddress(solver),
        proposal.deadline.toString(),
        ethers.utils.keccak256(proposal.data),
      ]
    )
  )
}

export function createProposal(params?: Partial<Proposal>): Proposal {
  params = { ...getDefaults(), ...params }
  return {
    deadline: params.deadline.toString(),
    data: params.data || '0x',
  }
}

function getDefaults(): Proposal {
  return {
    deadline: MAX_UINT256,
    data: '0x',
  }
}
