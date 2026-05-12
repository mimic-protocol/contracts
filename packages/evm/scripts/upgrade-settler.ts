import { HardhatEthers, HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData as Transaction } from '@safe-global/types-kit'
import { Contract, Eip1193Provider, getAddress } from 'ethers'
import { network } from 'hardhat'

import ProxyAdminArtifact from '../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import { deployCreate3 } from './deploy-create3'

const ERC1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

async function main(): Promise<void> {
  const { ethers, networkConfig, provider } = await network.connect()
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
    const to = await proxyAdmin.getAddress()
    const data = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [proxy, implementation.target, '0x'])
    const transactions = [{ to, value: '0', data }]
    await proposeSafeTransaction(safeAddress, transactions, chainId, signer, provider)
  } else {
    const tx = await proxyAdmin.upgradeAndCall(proxy, implementation.target, '0x')
    await tx.wait()
    console.log(`✅ Settler ${proxy} upgraded in tx ${tx.hash}`)
  }
}

async function proposeSafeTransaction(
  safeAddress: string,
  transactions: Transaction[],
  chainId: bigint,
  signer: HardhatEthersSigner,
  provider: Eip1193Provider
): Promise<void> {
  if (!process.env.SAFE_API_KEY) throw Error('SAFE_API_KEY env variable required for Safe proposal')
  const apiKit = new SafeApiKit({ chainId, apiKey: process.env.SAFE_API_KEY })

  const safe = await Safe.init({ safeAddress, signer: signer.address, provider })
  const safeTx = await safe.createTransaction({ transactions })
  const safeTxHash = await safe.getTransactionHash(safeTx)
  const senderSignature = await safe.signHash(safeTxHash)

  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTx.data,
    safeTxHash,
    senderAddress: signer.address,
    senderSignature: senderSignature.data,
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
