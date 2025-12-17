import { BN, IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'

import * as SettlerIDL from '../../target/idl/settler.json'
import * as WhitelistIDL from '../../target/idl/whitelist.json'
import { Settler } from '../../target/types/settler'
import { EntityType } from '../whitelist/Whitelist'
import { CreateIntentParams, ExtendIntentParams, IntentEvent, OpType, TokenFee } from './types'

type TokenFeeAnchor = {
  mint: web3.PublicKey
  amount: BN
}

type IntentEventAnchor = {
  topic: number[]
  data: Buffer
}

export default class SettlerSDK {
  protected program: Program<Settler>

  constructor(provider: Provider) {
    this.program = new Program(SettlerIDL, provider)
  }

  async initializeIx(): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods.initialize().instruction()
    return ix
  }

  async createIntentIx(
    intentHashHex: string,
    params: CreateIntentParams,
    isFinal = true
  ): Promise<web3.TransactionInstruction> {
    const { op, user, nonceHex, deadline, minValidations, dataHex, maxFees, eventsHex } = params

    const intentHash = this.parseIntentHashHex(intentHashHex)
    const nonce = this.parseIntentNonceHex(nonceHex)
    const data = Buffer.from(dataHex, 'hex')
    const maxFeesBn = this.parseTokenFees(maxFees)
    const events = this.parseIntentEventsHex(eventsHex)

    const ix = await this.program.methods
      .createIntent(
        intentHash,
        data,
        maxFeesBn,
        events,
        minValidations,
        this.opTypeToAnchorEnum(op),
        user,
        nonce,
        new BN(deadline),
        isFinal
      )
      .accountsPartial({
        solver: this.getSignerKey(),
        solverRegistry: this.getEntityRegistryPubkey(EntityType.Solver, this.getSignerKey()),
      })
      .instruction()

    return ix
  }

  async extendIntentIx(
    intentHashHex: string,
    params: ExtendIntentParams,
    finalize = true
  ): Promise<web3.TransactionInstruction> {
    const { moreDataHex = '', moreMaxFees = [], moreEventsHex = [] } = params

    const moreData = Buffer.from(moreDataHex, 'hex')
    const moreMaxFeesBn = this.parseTokenFees(moreMaxFees)
    const moreEvents = this.parseIntentEventsHex(moreEventsHex)

    const ix = await this.program.methods
      .extendIntent(moreData, moreMaxFeesBn, moreEvents, finalize)
      .accountsPartial({
        intentCreator: this.getSignerKey(),
        intent: this.getIntentKey(intentHashHex),
      })
      .instruction()

    return ix
  }

  async claimStaleIntentIx(intentHashHex: string): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods
      .claimStaleIntent()
      .accountsPartial({
        intentCreator: this.getSignerKey(),
        intent: this.getIntentKey(intentHashHex),
      })
      .instruction()

    return ix
  }

  getSettlerSettingsPubkey(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([Buffer.from('settler-settings')], this.program.programId)[0]
  }

  getIntentKey(intentHashHex: string): web3.PublicKey {
    const intentHash = Buffer.from(intentHashHex, 'hex')
    if (intentHash.length != 32) throw new Error(`Intent hash must be 32 bytes: ${intentHashHex}`)

    return web3.PublicKey.findProgramAddressSync([Buffer.from('intent'), intentHash], this.program.programId)[0]
  }

  getFulfilledIntentKey(intentHashHex: string): web3.PublicKey {
    const intentHash = Buffer.from(intentHashHex, 'hex')
    if (intentHash.length != 32) throw new Error(`Intent hash must be 32 bytes: ${intentHashHex}`)

    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('fulfilled-intent'), intentHash],
      this.program.programId
    )[0]
  }

  getEntityRegistryPubkey(entityType: EntityType, entityPubkey: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('entity-registry'), Buffer.from([entityType]), entityPubkey.toBuffer()],
      new web3.PublicKey(WhitelistIDL.address)
    )[0]
  }

  getSignerKey(): web3.PublicKey {
    if (!this.program.provider.wallet) throw new Error('Must set program provider wallet')
    return this.program.provider.wallet?.publicKey
  }

  opTypeToAnchorEnum(op: OpType): IdlTypes<Settler>['opType'] {
    if (op === OpType.Transfer) return { transfer: {} }
    if (op === OpType.Swap) return { swap: {} }
    if (op === OpType.Call) return { call: {} }

    throw new Error(`Unsupported op ${op}`)
  }

  private parseIntentHashHex(intentHashHex: string): number[] {
    const intentHash = Buffer.from(intentHashHex, 'hex')
    if (intentHash.length != 32) throw new Error(`Intent hash must be 32 bytes: ${intentHashHex}`)
    return Array.from(intentHash)
  }

  private parseIntentNonceHex(nonceHex: string): number[] {
    const nonce = Buffer.from(nonceHex, 'hex')
    if (nonce.length != 32) throw new Error(`Nonce must be 32 bytes: ${nonceHex}`)
    return Array.from(nonce)
  }

  private parseIntentEventsHex(eventsHex: IntentEvent[]): IntentEventAnchor[] {
    const events = eventsHex.map((eventHex) => ({
      topic: Array.from(Uint8Array.from(Buffer.from(eventHex.topicHex, 'hex'))),
      data: Buffer.from(eventHex.dataHex, 'hex'),
    }))
    if (events.some((event) => event.topic.length != 32)) throw new Error(`Event topics must be 32 bytes`)
    return events
  }

  private parseTokenFees(tokenFees: TokenFee[]): TokenFeeAnchor[] {
    return tokenFees.map((tokenFee) => ({
      ...tokenFee,
      amount: new BN(tokenFee.amount),
    }))
  }
}
