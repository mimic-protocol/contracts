import { HardhatEthers, HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { Contract, getAddress } from 'ethers'
import { network } from 'hardhat'

import ProxyAdminArtifact from '../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import { deployCreate3 } from './deploy-create3'

const ERC1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

async function main(): Promise<void> {
  const { ethers } = await network.connect()
  const [signer] = await ethers.getSigners()

  if (!process.env.SETTLER_PROXY) throw Error('SETTLER_PROXY env variable not provided')
  const proxy = getAddress(process.env.SETTLER_PROXY)

  const proxyAdmin = await getProxyAdmin(ethers, proxy, signer)
  const proxyAdminOwner = await proxyAdmin.owner()
  if (proxyAdminOwner !== signer.address) {
    throw Error(`Signer ${signer.address} is not the ProxyAdmin owner ${proxyAdminOwner}`)
  }

  const implementation = await deployCreate3(SettlerArtifact, [], '0x1802')
  const tx = await proxyAdmin.upgradeAndCall(proxy, implementation.target, '0x')
  await tx.wait()
  console.log(`✅ Settler ${proxy} upgraded in tx ${tx.hash}`)
}

async function getProxyAdmin(ethers: HardhatEthers, proxy: string, signer: HardhatEthersSigner): Promise<Contract> {
  const rawAdmin = await ethers.provider.getStorage(proxy, ERC1967_ADMIN_SLOT)
  const adminAddress = getAddress(`0x${rawAdmin.slice(-40)}`)
  return ethers.getContractAt(ProxyAdminArtifact.abi, adminAddress, signer)
}

main().catch(console.error)
