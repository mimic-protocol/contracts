import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'

const { ethers } = await network.connect()

import { network } from 'hardhat'

const ROOT_AUTHORITY = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

const DOMAIN = {
  name: 'DelegationManager',
  version: '1',
  chainId: 0,
  verifyingContract: '',
}

const DELEGATION_712_TYPES = {
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
} as const

const DELEGATION_ABI_TYPE =
  'tuple(address delegate,address delegator,bytes32 authority,tuple(address enforcer,bytes terms,bytes args)[] caveats,uint256 salt,bytes signature)'

export async function signDelegation(
  user: HardhatEthersSigner,
  delegate: string,
  delegationManager: string
): Promise<string> {
  const chainId = (await ethers.provider.getNetwork()).chainId
  const delegation = {
    delegate,
    delegator: user.address,
    authority: ROOT_AUTHORITY,
    caveats: [],
    salt: 1n,
    signature: '0x',
  }

  delegation.signature = await user.signTypedData(
    { ...DOMAIN, chainId, verifyingContract: delegationManager },
    DELEGATION_712_TYPES,
    {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      caveats: [],
      salt: delegation.salt,
    }
  )

  const abi = ethers.AbiCoder.defaultAbiCoder()
  return abi.encode([`${DELEGATION_ABI_TYPE}[]`], [[delegation]])
}
