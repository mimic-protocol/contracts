import { Interface } from 'ethers'

import ControllerArtifact from '../artifacts/contracts/Controller.sol/Controller.json'
import DynamicCallEncoderArtifact from '../artifacts/contracts/dynamic-calls/DynamicCallEncoder.sol/DynamicCallEncoder.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
import SettlerProxyArtifact from '../artifacts/contracts/SettlerProxy.sol/SettlerProxy.json'
import SmartAccount7702 from '../artifacts/contracts/smart-accounts/SmartAccount7702.sol/SmartAccount7702.json'
import MimicHelperArtifact from '../artifacts/contracts/utils/MimicHelper.sol/MimicHelper.json'
import { deployCreate3 } from './deploy-create3'

const MIN_VALIDATORS = 1

async function main(): Promise<void> {
  if (!process.env.AXIA) throw Error('AXIA env variable not provided')
  if (!process.env.ADMIN) throw Error('ADMIN env variable not provided')
  if (!process.env.SOLVER) throw Error('SOLVER env variable not provided')
  if (!process.env.VALIDATOR) throw Error('VALIDATOR env variable not provided')
  const { ADMIN, SOLVER, AXIA, VALIDATOR } = process.env

  const controllerArgs = [ADMIN, [SOLVER], [], [AXIA], [VALIDATOR], MIN_VALIDATORS]
  const controller = await deployCreate3(ControllerArtifact, controllerArgs, '0x17')

  const dynamicCallEncoder = await deployCreate3(DynamicCallEncoderArtifact, [], '0x20')
  const settlerImplementation = await deployCreate3(SettlerArtifact, [], '0x1801')

  const initializeData = new Interface(SettlerArtifact.abi).encodeFunctionData('initialize', [
    controller.target,
    ADMIN,
    dynamicCallEncoder.target,
  ])
  const settlerProxy = await deployCreate3(
    SettlerProxyArtifact,
    [settlerImplementation.target, ADMIN, initializeData],
    '0x18'
  )

  await deployCreate3(SmartAccount7702, [settlerProxy.target], '0x19')
  await deployCreate3(MimicHelperArtifact, [], '0x42')
}

main().catch(console.error)
