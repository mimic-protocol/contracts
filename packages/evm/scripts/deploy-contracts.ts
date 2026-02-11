import ControllerArtifact from '../artifacts/contracts/Controller.sol/Controller.json'
import SettlerArtifact from '../artifacts/contracts/Settler.sol/Settler.json'
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
  const settler = await deployCreate3(SettlerArtifact, [controller.target, ADMIN], '0x18')
  await deployCreate3(SmartAccount7702, [settler.target], '0x19')
  await deployCreate3(MimicHelperArtifact, [], '0x41')
}

main().catch(console.error)
