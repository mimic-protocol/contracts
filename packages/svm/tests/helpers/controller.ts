import { EntityType, SvmController } from '@mimicprotocol/sdk'
import { PublicKey } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, TransactionMetadata } from 'litesvm'

import { makeTxSignAndSend } from '../utils'

/**
 * Creates an allowlisted entity (validator, axia, or solver)
 * For Solvers: accepts Solana PublicKey (32 bytes)
 * For Validators/Axia: accepts Ethereum address Buffer (20 bytes)
 */
export async function createAllowlistedEntity(
  controllerSdk: SvmController,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityAddress: PublicKey | Buffer
): Promise<PublicKey | Buffer> {
  const ix = await controllerSdk.setAllowedEntityIx(entityType, entityAddress)
  await makeTxSignAndSend(provider, ix)
  return entityAddress
}

/**
 * Closes EntityRegistry for a given entity address and type
 * @returns Successful or failed transaction metadata
 */
export async function removeEntityFromAllowlist(
  controllerSdk: SvmController,
  provider: LiteSVMProvider,
  entityType: EntityType,
  entityAddress: PublicKey | Buffer
): Promise<TransactionMetadata | FailedTransactionMetadata> {
  const ix = await controllerSdk.closeEntityRegistryIx(entityType, entityAddress)
  return await makeTxSignAndSend(provider, ix)
}
