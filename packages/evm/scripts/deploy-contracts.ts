import { verifyContract } from '@nomicfoundation/hardhat-verify/verify'
import { concat, Contract, Interface, zeroPadValue } from 'ethers'
import hre, { network } from 'hardhat'
import type { Artifact } from 'hardhat/types/artifacts'

import ControllerArtifact from '../artifacts/contracts/Controller.sol/Controller.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import SmartAccountArtifact from '../artifacts/contracts/SmartAccount.sol/SmartAccount.json'
import buildCreate3Module from '../ignition/modules/Create3'

/* eslint-disable no-secrets/no-secrets */

const ADMIN = '0x3A0cE8115b4913F42C4928D6bC3f554e9A81468B'
const AXIA = '0x3F4C47E37A94caeE31d0B585f54F3fFA1f2294C9'
const SOLVER = '0xE0D76433Edd9f5df370561bd0AF231E72c83Cd3a'

/* eslint-enable no-secrets/no-secrets */

async function main(): Promise<void> {
  const controller = await deployCreate3(ControllerArtifact, [ADMIN, [SOLVER], [], [AXIA]], '0x10')
  const settler = await deployCreate3(SettlerArtifact, [controller.target, ADMIN], '0x11')
  await deployCreate3(SmartAccountArtifact, [settler.target, ADMIN], '0x12')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deployCreate3(artifact: Artifact, args: any[], saltSuffix: string): Promise<Contract> {
  const { ethers, ignition } = await network.connect()
  const [signer] = await ethers.getSigners()
  const salt = buildProtectedSalt(signer.address, saltSuffix)

  const { contractName, abi, bytecode } = artifact
  const encodedArgs = new Interface(abi).encodeDeploy(args)
  const initCode = bytecode + encodedArgs.slice(2)

  const module = buildCreate3Module(contractName)
  const result = await ignition.deploy(module, { parameters: { [module.id]: { initCode, salt, contractName } } })
  console.log(`\n🚀 ${contractName} deployed to ${result[contractName].target}, verifying...`)

  const verificationArgs = { address: result[contractName].target, constructorArgs: args }
  await verifyContract(verificationArgs, hre)
  return result[contractName]
}

function buildProtectedSalt(address: string, entropy: string): string {
  // Address (20 bytes), chain protection flag (0 byte), entropy (11 bytes) = 32 bytes total
  const paddedAddress = zeroPadValue(address, 20)
  const flagByte = '0x00'
  const paddedEntropy = zeroPadValue(entropy, 11)
  return concat([paddedAddress, flagByte, paddedEntropy])
}

main().catch(console.error)
