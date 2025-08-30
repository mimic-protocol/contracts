import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { Contract } from 'ethers'
import { network } from 'hardhat'

import { hashIntent, Intent } from '../intents/index.js'
import { DOMAIN_NAME_DEFAULTS } from '../proposal/index.js'

export const INTENT_HASH_VALIDATION_TYPE = {
  Validation: [{ name: 'intent', type: 'bytes32' }],
}

export async function signIntentHash(
  settler: Contract,
  intentHash: string,
  signer: HardhatEthersSigner
): Promise<string> {
  const connection = await network.connect()
  const chainId = connection.networkConfig.chainId
  const domain = { ...DOMAIN_NAME_DEFAULTS, chainId, verifyingContract: settler.target }
  return signer.signTypedData(domain, INTENT_HASH_VALIDATION_TYPE, { intent: intentHash })
}

export async function addValidations(
  settler: Contract,
  intent: Intent,
  validators: HardhatEthersSigner[]
): Promise<void> {
  const validations = []
  for (const validator of validators) {
    validations.push(await signIntentHash(settler, hashIntent(intent), validator))
  }
  intent.validations = validations
}
