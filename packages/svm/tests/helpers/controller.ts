import { PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'

import ControllerSDK, { EntityType } from '../../sdks/controller/Controller'
import { makeTxSignAndSend } from '../utils'

/**
 * Creates an allowlisted entity (validator, axia, or solver)
 * For Solvers: accepts Solana PublicKey (32 bytes)
 * For Validators/Axia: accepts Ethereum address Buffer (20 bytes)
 */
export async function createAllowlistedEntity(
  controllerSdk: ControllerSDK,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityAddress: PublicKey | Buffer
): Promise<PublicKey | Buffer> {
  const allowlistIx = await controllerSdk.setAllowedEntityIx(entityType, entityAddress)
  await makeTxSignAndSend(provider, allowlistIx)
  return entityAddress
}
