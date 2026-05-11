import { HardhatEthers, HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import { Contract, getAddress, Wallet } from 'ethers'
import { network } from 'hardhat'

import ProxyAdminArtifact from '../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import { deployCreate3 } from './deploy-create3'

const ERC1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

async function main(): Promise<void> {
  const { ethers, networkConfig } = await network.connect()
  const [signer] = await ethers.getSigners()

  if (!process.env.SETTLER_PROXY) throw Error('SETTLER_PROXY env variable not provided')
  const proxy = getAddress(process.env.SETTLER_PROXY)

  const proxyAdmin = await getProxyAdmin(ethers, proxy, signer)
  const proxyAdminOwner = await proxyAdmin.owner()

  const safeAddress = process.env.SAFE ? getAddress(process.env.SAFE) : undefined
  const expectedOwner = safeAddress ?? signer.address

  if (proxyAdminOwner !== expectedOwner) {
    throw Error(`Expected owner ${expectedOwner} does not match ProxyAdmin owner ${proxyAdminOwner}`)
  }

  const implementation = await deployCreate3(SettlerArtifact, [], '0x04302605', 'V1')

  if (safeAddress) {
    const { chainId } = await ethers.provider.getNetwork()
    if (networkConfig.type !== 'http') throw Error('Safe proposal requires an HTTP network')
    const rpcUrl = await networkConfig.url.getUrl()
    await proposeTransaction(safeAddress, proxyAdmin, proxy, implementation.target, chainId, rpcUrl)
  } else {
    const tx = await proxyAdmin.upgradeAndCall(proxy, implementation.target, '0x')
    await tx.wait()
    console.log(`✅ Settler ${proxy} upgraded in tx ${tx.hash}`)
  }
}

async function proposeTransaction(
  safeAddress: string,
  proxyAdmin: Contract,
  proxy: string,
  implementation: string,
  chainId: bigint,
  rpcUrl: string
): Promise<void> {
  if (!process.env.SAFE_API_KEY) throw Error('SAFE_API_KEY env variable required for Safe proposal')

  if (!process.env.DEPLOYER_PRIVATE_KEY) throw Error('DEPLOYER_PRIVATE_KEY env variable required for Safe proposal')
  const signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY)

  const safe = await Safe.init({
    provider: rpcUrl,
    safeAddress,
  })

  const apiKit = new SafeApiKit({ chainId, apiKey: process.env.SAFE_API_KEY })

  const data = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [proxy, implementation, '0x'])
  const to = String(await proxyAdmin.getAddress())

  const safeTransaction = await safe.createTransaction({
    transactions: [{ to, value: '0', data }],
  })

  const safeTxHash = await safe.getTransactionHash(safeTransaction)
  const senderSignature = signer.signingKey.sign(safeTxHash).serialized

  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: signer.address,
    senderSignature,
  })

  console.log(`✅ Upgrade proposed to Safe ${safeAddress}`)
  console.log(`   Safe TX Hash: ${safeTxHash}`)
}

async function getProxyAdmin(ethers: HardhatEthers, proxy: string, signer: HardhatEthersSigner): Promise<Contract> {
  const rawAdmin = await ethers.provider.getStorage(proxy, ERC1967_ADMIN_SLOT)
  const adminAddress = getAddress(`0x${rawAdmin.slice(-40)}`)
  return ethers.getContractAt(ProxyAdminArtifact.abi, adminAddress, signer)
}

main().catch(console.error)
