import { IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'

import * as ControllerIDL from '../../target/idl/controller.json'
import { Controller } from '../../target/types/controller'

export const EntityType = {
  Validator: 0,
  Axia: 1,
  Solver: 2,
} as const

export type EntityType = (typeof EntityType)[keyof typeof EntityType]

export default class ControllerSDK {
  protected program: Program<Controller>

  constructor(provider: Provider) {
    this.program = new Program(ControllerIDL, provider)
  }

  async initializeIx(admin: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const controllerSettings = this.getControllerSettingsPubkey()
    const ix = await this.program.methods
      .initialize(admin)
      .accountsPartial({
        deployer: this.getSignerKey(),
        controllerSettings,
      })
      .instruction()
    return ix
  }

  async setAdmin(newAdmin: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const controllerSettings = this.getControllerSettingsPubkey()
    const ix = await this.program.methods
      .setAdmin(newAdmin)
      .accountsPartial({
        admin: this.getSignerKey(),
        controllerSettings,
      })
      .instruction()
    return ix
  }

  async setAllowedEntityIx(entityType: EntityType, entityAddress: web3.PublicKey | Buffer): Promise<web3.TransactionInstruction> {
    const entityAddressBuffer = entityAddress instanceof web3.PublicKey ? entityAddress.toBuffer() : entityAddress
    const entityRegistry = this.getEntityRegistryPubkey(entityType, entityAddressBuffer)
    const controllerSettings = this.getControllerSettingsPubkey()
    const ix = await this.program.methods
      .setAllowedEntity(this.entityTypeToAnchorEnum(entityType), entityAddressBuffer)
      .accountsPartial({
        admin: this.getSignerKey(),
        entityRegistry,
        controllerSettings,
      })
      .instruction()
    return ix
  }

  async closeEntityRegistryIx(
    entityType: EntityType,
    entityAddress: web3.PublicKey | Buffer
  ): Promise<web3.TransactionInstruction> {
    const entityAddressBuffer = entityAddress instanceof web3.PublicKey ? entityAddress.toBuffer() : entityAddress
    const entityRegistry = this.getEntityRegistryPubkey(entityType, entityAddressBuffer)
    const controllerSettings = this.getControllerSettingsPubkey()
    const ix = await this.program.methods
      .closeEntityRegistry(this.entityTypeToAnchorEnum(entityType), entityAddressBuffer)
      .accountsPartial({
        admin: this.getSignerKey(),
        entityRegistry,
        controllerSettings,
      })
      .instruction()
    return ix
  }

  getSignerKey(): web3.PublicKey {
    if (!this.program.provider.wallet) throw new Error('Must set program provider wallet')
    return this.program.provider.wallet?.publicKey
  }

  getControllerSettingsPubkey(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([Buffer.from('controller-settings')], this.program.programId)[0]
  }

  getEntityRegistryPubkey(entityType: EntityType, entityAddress: web3.PublicKey | Buffer): web3.PublicKey {
    const entityAddressBuffer = entityAddress instanceof web3.PublicKey ? entityAddress.toBuffer() : entityAddress
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('entity-registry'), Buffer.from([entityType]), entityAddressBuffer],
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
