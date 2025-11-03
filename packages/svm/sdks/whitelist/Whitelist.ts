import { BN, IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'

import * as WhitelistIDL from '../../target/idl/whitelist.json'
import { Whitelist } from '../../target/types/whitelist'

export enum EntityType {
  // eslint-disable-next-line no-unused-vars
  Validator = 1,
  // eslint-disable-next-line no-unused-vars
  Axia = 2,
  // eslint-disable-next-line no-unused-vars
  Solver = 3,
}

export enum WhitelistStatus {
  // eslint-disable-next-line no-unused-vars
  Whitelisted = 1,
  // eslint-disable-next-line no-unused-vars
  Blacklisted = 2,
}

export default class WhitelistSDK {
  protected program: Program<Whitelist>

  constructor(provider: Provider) {
    this.program = new Program(WhitelistIDL, provider)
  }

  async initializeIx(admin: web3.PublicKey, proposedAdminCooldown: number): Promise<web3.TransactionInstruction> {
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .initialize(admin, new BN(proposedAdminCooldown))
      .accountsPartial({
        deployer: this.getSignerKey(),
        globalSettings,
      })
      .instruction()
    return ix
  }

  async proposeAdminIx(proposedAdmin: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .proposeAdmin(proposedAdmin)
      .accountsPartial({
        admin: this.getSignerKey(),
        globalSettings,
      })
      .instruction()
    return ix
  }

  async setEntityWhitelistStatusIx(
    entityType: EntityType,
    entityPubkey: web3.PublicKey,
    status: WhitelistStatus
  ): Promise<web3.TransactionInstruction> {
    const entityRegistry = this.getEntityRegistryPubkey(entityType, entityPubkey)
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .setEntityWhitelistStatus(
        this.entityTypeToAnchorEnum(entityType),
        entityPubkey,
        this.whitelistStatusToAnchorEnum(status)
      )
      .accountsPartial({
        admin: this.getSignerKey(),
        entityRegistry,
        globalSettings,
      })
      .instruction()
    return ix
  }

  async setProposedAdminIx(): Promise<web3.TransactionInstruction> {
    const globalSettings = this.getGlobalSettingsPubkey()
    const ix = await this.program.methods
      .setProposedAdmin()
      .accountsPartial({
        proposedAdmin: this.getSignerKey(),
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

  entityTypeToAnchorEnum(entityType: EntityType): IdlTypes<Whitelist>['entityType'] {
    if (entityType === EntityType.Validator) return { validator: {} }
    if (entityType === EntityType.Axia) return { axia: {} }
    if (entityType === EntityType.Solver) return { solver: {} }

    throw new Error(`Unsupported entity type ${entityType}`)
  }

  whitelistStatusToAnchorEnum(status: WhitelistStatus): IdlTypes<Whitelist>['whitelistStatus'] {
    if (status === WhitelistStatus.Whitelisted) return { whitelisted: {} }
    if (status === WhitelistStatus.Blacklisted) return { blacklisted: {} }

    throw new Error(`Unsupported whitelist status ${status}`)
  }
}
