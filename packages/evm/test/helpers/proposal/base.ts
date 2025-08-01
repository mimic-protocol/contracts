import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { AbiCoder, Contract, keccak256, toUtf8Bytes } from 'ethers'
import { network } from 'hardhat'

import { Account, toAddress } from '../addresses'
import { MAX_UINT256 } from '../constants'
import { hashIntent, Intent } from '../intents'
import { BigNumberish } from '../numbers'

export const DOMAIN_NAME_DEFAULTS = { name: 'Mimic Protocol Settler', version: '1' }

export const PROPOSAL_TYPE_HASH = keccak256(
  toUtf8Bytes('Proposal(bytes32 intent,address solver,uint256 deadline,bytes data,uint256[] fees)')
)
export const PROPOSAL_TYPE = {
  Proposal: [
    { name: 'intent', type: 'bytes32' },
    { name: 'solver', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'fees', type: 'uint256[]' },
  ],
}

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
  const domain = { ...DOMAIN_NAME_DEFAULTS, chainId, verifyingContract: settler.target }
  return signer.signTypedData(domain, PROPOSAL_TYPE, {
    intent: hashIntent(intent),
    solver: toAddress(solver),
    deadline: proposal.deadline,
    data: proposal.data,
    fees: proposal.fees,
  })
}

export function hashProposal(proposal: Proposal, intent: Intent, solver: Account): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      [
        'bytes32', // type hash
        'bytes32', // intent hash
        'address', // solver
        'uint256', // deadline
        'bytes32', // keccak256 of data
        'bytes32', // fees hash
      ],
      [
        PROPOSAL_TYPE_HASH,
        hashIntent(intent),
        toAddress(solver),
        proposal.deadline.toString(),
        keccak256(proposal.data),
        hashFees(proposal.fees),
      ]
    )
  )
}

export function hashFees(fees: BigNumberish[]): string {
  return keccak256('0x' + fees.map((f) => AbiCoder.defaultAbiCoder().encode(['uint256'], [f]).slice(2)).join(''))
}

export function createProposal(params?: Partial<Proposal>): Proposal {
  params = { ...getDefaults(), ...params }
  return {
    deadline: params.deadline.toString(),
    data: params.data || '0x',
    fees: params.fees || [],
  }
}

function getDefaults(): Proposal {
  return {
    deadline: MAX_UINT256,
    data: '0x',
    fees: [],
  }
}
