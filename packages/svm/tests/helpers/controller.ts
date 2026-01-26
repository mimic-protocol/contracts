import { Keypair } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'

import ControllerSDK, { EntityType } from '../../sdks/controller/Controller'
import { makeTxSignAndSend } from '../utils'

/**
 * Creates an allowlisted entity (validator, axia, or solver)
 */
export async function createAllowlistedEntity(
  controllerSdk: ControllerSDK,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityKeypair?: Keypair
): Promise<Keypair> {
  const entity = entityKeypair || Keypair.generate()
  const allowlistIx = await controllerSdk.setAllowedEntityIx(entityType, entity.publicKey)
  await makeTxSignAndSend(provider, allowlistIx)
  return entity
}
