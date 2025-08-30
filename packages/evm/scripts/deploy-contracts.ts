import { verifyContract } from '@nomicfoundation/hardhat-verify/verify'
import { concat, Contract, Interface, zeroPadValue } from 'ethers'
import hre, { network } from 'hardhat'
import type { Artifact } from 'hardhat/types/artifacts'

import ControllerArtifact from '../artifacts/contracts/Controller.sol/Controller.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import buildCreate3Module from '../ignition/modules/Create3'

async function main(): Promise<void> {
  if (!process.env.AXIA) throw Error('AXIA env variable not provided')
  if (!process.env.ADMIN) throw Error('ADMIN env variable not provided')
  if (!process.env.SOLVER) throw Error('SOLVER env variable not provided')
  if (!process.env.VALIDATOR) throw Error('VALIDATOR env variable not provided')
  const { ADMIN, SOLVER, AXIA, VALIDATOR } = process.env

  const controller = await deployCreate3(ControllerArtifact, [ADMIN, [SOLVER], [], [AXIA], [VALIDATOR]], '0x15')
  await deployCreate3(SettlerArtifact, [controller.target, ADMIN], '0x16')
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
