import { BN, IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'

import * as SettlerIDL from '../../target/idl/settler.json'
import * as WhitelistIDL from '../../target/idl/whitelist.json'
import { Settler } from '../../target/types/settler'
import { EntityType } from '../whitelist/Whitelist'
import {
  CreateIntentParams,
  ExtendIntentParams,
  IntentEvent,
  MaxFee,
  OpType,
  ProposalInstruction,
  ProposalInstructionAccountMeta,
} from './types'

type MaxFeeAnchor = {
  mint: web3.PublicKey
  amount: BN
}

type IntentEventAnchor = {
  topic: number[]
  data: Buffer
}

type ProposalInstructionAnchor = {
  programId: web3.PublicKey
  accounts: ProposalInstructionAccountMeta[]
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
    const maxFeesBn = this.parseIntentMaxFees(maxFees)
    const events = this.parseIntentEventsHex(eventsHex)

    const ix = await this.program.methods
      .createIntent(
        intentHash,
        data,
        maxFeesBn,
        events,
        this.opTypeToAnchorEnum(op),
        user,
        nonce,
        new BN(deadline),
        minValidations,
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
    const moreMaxFeesBn = this.parseIntentMaxFees(moreMaxFees)
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

  async createProposalIx(
    intentHashHex: string,
    instructions: ProposalInstruction[],
    deadline: number,
    isFinal = true
  ): Promise<web3.TransactionInstruction> {
    const parsedInstructions = this.parseProposalInstructions(instructions)

    const ix = await this.program.methods
      .createProposal(parsedInstructions, new BN(deadline), isFinal)
      .accountsPartial({
        solver: this.getSignerKey(),
        solverRegistry: this.getEntityRegistryPubkey(EntityType.Solver, this.getSignerKey()),
        intent: this.getIntentKey(intentHashHex),
        fulfilledIntent: this.getFulfilledIntentKey(intentHashHex),
      })
      .instruction()

    return ix
  }

  async addInstructionsToProposalIx(
    intentHashHex: string,
    moreInstructions: ProposalInstruction[],
    finalize = true,
    solverPubkey?: web3.PublicKey
  ): Promise<web3.TransactionInstruction> {
    const parsedInstructions = this.parseProposalInstructions(moreInstructions)
    const solver = solverPubkey || this.getSignerKey()

    const ix = await this.program.methods
      .addInstructionsToProposal(parsedInstructions, finalize)
      .accountsPartial({
        proposalCreator: this.getSignerKey(),
        proposal: this.getProposalKey(intentHashHex, solver),
      })
      .instruction()

    return ix
  }

  async claimStaleProposalIx(
    intentHashesHex: string[],
    solverPubkey?: web3.PublicKey
  ): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods
      .claimStaleProposal()
      .accountsPartial({
        proposalCreator: this.getSignerKey(),
      })
      .remainingAccounts(
        intentHashesHex.map((intentHashHex) => ({
          pubkey: this.getProposalKey(intentHashHex, solverPubkey),
          isWritable: true,
          isSigner: false,
        }))
      )
      .instruction()

    return ix
  }

  async addValidatorSigIxs(
    intent: web3.PublicKey,
    intentHash: Buffer,
    validator: web3.PublicKey,
    signature: number[]
  ): Promise<web3.TransactionInstruction[]> {
    const ed25519Ix = web3.Ed25519Program.createInstructionWithPublicKey({
      message: intentHash,
      publicKey: validator.toBuffer(),
      signature: Buffer.from(signature),
    })

    const ix = await this.program.methods
      .addValidatorSig()
      .accountsPartial({
        solver: this.getSignerKey(),
        solverRegistry: this.getEntityRegistryPubkey(EntityType.Solver, this.getSignerKey()),
        intent,
        validatorRegistry: this.getEntityRegistryPubkey(EntityType.Validator, validator),
        ixSysvar: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    return [ed25519Ix, ix]
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

  getProposalKey(intentHashHex: string, solverPubkey?: web3.PublicKey): web3.PublicKey {
    const intentHash = Buffer.from(intentHashHex, 'hex')
    if (intentHash.length != 32) throw new Error(`Intent hash must be 32 bytes: ${intentHashHex}`)

    const intentKey = this.getIntentKey(intentHashHex)
    const solver = solverPubkey || this.getSignerKey()

    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('proposal'), intentKey.toBuffer(), solver.toBuffer()],
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

  private parseIntentMaxFees(maxFees: MaxFee[]): MaxFeeAnchor[] {
    return maxFees.map((maxFee) => ({
      ...maxFee,
      amount: new BN(maxFee.amount),
    }))
  }

  private parseProposalInstructions(instructions: ProposalInstruction[]): ProposalInstructionAnchor[] {
    return instructions.map((instruction) => ({
      ...instruction,
      data: typeof instruction.data === 'string' ? Buffer.from(instruction.data, 'hex') : instruction.data,
    }))
  }
}
