import { IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'

import * as ControllerIDL from '../../target/idl/controller.json'
import { Controller } from '../../target/types/controller'

export const EntityType = {
  Validator: 1,
  Axia: 2,
  Solver: 3,
} as const

export type EntityType = (typeof EntityType)[keyof typeof EntityType]

export default class ControllerSDK {
  protected program: Program<Controller>

  constructor(provider: Provider) {
    this.program = new Program(ControllerIDL, provider)
  }

  async initializeIx(admin: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .initialize(admin)
      .accountsPartial({
        deployer: this.getSignerKey(),
        globalSettings,
      })
      .instruction()
    return ix
  }

  async setAdmin(newAdmin: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .setAdmin(newAdmin)
      .accountsPartial({
        admin: this.getSignerKey(),
        globalSettings,
      })
      .instruction()
    return ix
  }

  async createEntityRegistryIx(
    entityType: EntityType,
    entityPubkey: web3.PublicKey
  ): Promise<web3.TransactionInstruction> {
    const entityRegistry = this.getEntityRegistryPubkey(entityType, entityPubkey)
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .createEntityRegistry(this.entityTypeToAnchorEnum(entityType), entityPubkey)
      .accountsPartial({
        admin: this.getSignerKey(),
        entityRegistry,
        globalSettings,
      })
      .instruction()
    return ix
  }

  async closeEntityRegistryIx(
    entityType: EntityType,
    entityPubkey: web3.PublicKey
  ): Promise<web3.TransactionInstruction> {
    const entityRegistry = this.getEntityRegistryPubkey(entityType, entityPubkey)
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .closeEntityRegistry(this.entityTypeToAnchorEnum(entityType), entityPubkey)
      .accountsPartial({
        admin: this.getSignerKey(),
        entityRegistry,
        globalSettings,
      })
      .instruction()
    return ix
  }

  getSignerKey(): web3.PublicKey {
    if (!this.program.provider.wallet) throw new Error('Must set program provider wallet')
    return this.program.provider.wallet?.publicKey
  }

  getGlobalSettingsPubkey(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([Buffer.from('global-settings')], this.program.programId)[0]
  }

  getEntityRegistryPubkey(entityType: EntityType, entityPubkey: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('entity-registry'), Buffer.from([entityType]), entityPubkey.toBuffer()],
      this.program.programId
    )[0]
  }

  entityTypeToAnchorEnum(entityType: EntityType): IdlTypes<Controller>['entityType'] {
    if (entityType === EntityType.Validator) return { validator: {} }
    if (entityType === EntityType.Axia) return { axia: {} }
    if (entityType === EntityType.Solver) return { solver: {} }

    throw new Error(`Unsupported entity type ${entityType}`)
  }
}
