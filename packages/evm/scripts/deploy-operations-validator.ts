import { getAddress } from 'ethers'
import { network } from 'hardhat'

import OperationsValidatorArtifact from '../artifacts/contracts/safeguards/OperationsValidator.sol/OperationsValidator.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import { deployCreate3 } from './deploy-create3'

async function main(): Promise<void> {
  const { ethers } = await network.connect()
  const [signer] = await ethers.getSigners()

  const validator = await deployCreate3(OperationsValidatorArtifact, [], '0x28082601')

  if (!process.env.SETTLER_PROXY) {
    console.log('\nSETTLER_PROXY not provided, skipping the operations validator wiring')
    return
  }

  const proxy = getAddress(process.env.SETTLER_PROXY)
  const settler = await ethers.getContractAt(SettlerArtifact.abi, proxy, signer)

  const currentValidator = await settler.operationsValidator()
  if (currentValidator === validator.target) {
    console.log(`\n✅ Settler ${proxy} already points to the operations validator ${currentValidator}`)
    return
  }

  console.log(`\nSetting the operations validator on Settler ${proxy}...`)
  const tx = await settler.setOperationsValidator(validator.target)
  await tx.wait()
  console.log(`✅ Operations validator set to ${validator.target} in tx ${tx.hash}`)
}

main().catch(console.error)
