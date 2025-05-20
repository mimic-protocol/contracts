import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { AbiCoder, Contract, keccak256, toUtf8Bytes } from 'ethers'
import { network } from 'hardhat'

import { Account, toAddress } from '../addresses'
import { MAX_UINT256 } from '../constants'
import { encodeIntent, Intent } from '../intents'
import { BigNumberish } from '../numbers'

export const DOMAIN_NAME_DEFAULTS = { name: 'Mimic Protocol Settler', version: '1' }

export const PROPOSAL_TYPE_HASH = keccak256(
  toUtf8Bytes('Proposal(bytes32 intent,address solver,uint256 deadline,bytes data)')
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
  signer: HardhatEthersSigner
): Promise<string> {
  const connection = await network.connect()
  const chainId = connection.networkConfig.chainId
  const domain = { ...DOMAIN_NAME_DEFAULTS, chainId, verifyingContract: settler.target }
  return signer.signTypedData(domain, PROPOSAL_TYPE, {
    intent: encodeIntent(intent),
    solver: toAddress(solver),
    deadline: proposal.deadline,
    data: proposal.data,
  })
}

export function encodeProposal(proposal: Proposal, intent: Intent, solver: Account): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
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
        keccak256(proposal.data),
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
