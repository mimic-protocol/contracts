import { HardhatEthers } from '@nomicfoundation/hardhat-ethers/types'
import { Contract } from 'ethers'

import { Account, toAddress } from './addresses.js'

export async function deployProxy<T extends Contract>(
  ethers: HardhatEthers,
  implementationName: string,
  initialOwner: Account,
  initializeArgs: unknown[]
): Promise<T> {
  const implementation = await ethers.deployContract(implementationName)
  const initializeData = implementation.interface.encodeFunctionData('initialize', initializeArgs)
  const proxy = await ethers.deployContract('Proxy', [implementation, toAddress(initialOwner), initializeData])
  return ethers.getContractAt(implementationName, proxy.target) as Promise<T>
}
