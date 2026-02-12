import { BN, IdlTypes, Program, Provider, web3 } from '@coral-xyz/anchor'
import { Chains, hexToBytes, INTENT_HASH_VALIDATION_712_TYPES, SETTLER_EIP712_DOMAIN } from '@mimicprotocol/sdk'
import { ethers } from 'ethers'

import * as ControllerIDL from '../../target/idl/controller.json'
import * as SettlerIDL from '../../target/idl/settler.json'
import { Settler } from '../../target/types/settler'
import { EntityType } from '../controller/Controller'
import {
  CreateIntentParams,
  CreateProposalParams,
  ExtendIntentParams,
  IntentEvent,
  OpType,
  ProposalInstruction,
  ProposalInstructionAccountMeta,
  TokenFee,
} from './types'

type TokenFeeAnchor = {
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
        creator: this.getSignerKey(),
        intent: this.getIntentKey(intentHashHex),
      })
      .instruction()

    return ix
  }

  async claimStaleIntentIx(intentHashHex: string): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods
      .claimStaleIntent()
      .accountsPartial({
        creator: this.getSignerKey(),
        intent: this.getIntentKey(intentHashHex),
      })
      .instruction()

    return ix
  }

  async createProposalIx(intentHashHex: string, params: CreateProposalParams): Promise<web3.TransactionInstruction> {
    const { instructions, fees, deadline, isFinal } = params
    const parsedInstructions = this.parseProposalInstructions(instructions)
    const parsedFees = this.parseTokenFees(fees)

    const ix = await this.program.methods
      .createProposal(parsedInstructions, parsedFees, new BN(deadline), isFinal ?? false)
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
        creator: this.getSignerKey(),
        proposal: this.getProposalKey(intentHashHex, solver),
      })
      .instruction()

    return ix
  }

  async claimStaleProposalIx(
    intentHashHex: string,
    solverPubkey?: web3.PublicKey
  ): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods
      .claimStaleProposal()
      .accountsPartial({
        creator: this.getSignerKey(),
        proposal: this.getProposalKey(intentHashHex, solverPubkey),
      })
      .instruction()

    return ix
  }

  async addValidatorSigIxs(
    intent: web3.PublicKey,
    intentHash: Buffer,
    validatorEthAddress: Buffer,
    signature: number[],
    recoveryId: number
  ): Promise<web3.TransactionInstruction[]> {
    const eip712Preimage = this.getEip712Preimage(INTENT_HASH_VALIDATION_712_TYPES, { intent: intentHash })

    const secp256k1Ix = web3.Secp256k1Program.createInstructionWithEthAddress({
      message: hexToBytes(eip712Preimage),
      ethAddress: validatorEthAddress,
      signature: Buffer.from(signature),
      recoveryId,
    })

    const ix = await this.program.methods
      .addValidatorSig()
      .accountsPartial({
        solver: this.getSignerKey(),
        solverRegistry: this.getEntityRegistryPubkey(EntityType.Solver, this.getSignerKey()),
        intent,
        validatorRegistry: this.getEntityRegistryPubkey(EntityType.Validator, validatorEthAddress),
        ixSysvar: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    return [secp256k1Ix, ix]
  }

  async addAxiaSigIxs(
    proposal: web3.PublicKey,
    axiaEthAddress: Buffer,
    signature: number[],
    recoveryId: number
  ): Promise<web3.TransactionInstruction[]> {
    const prefixedMessage = Buffer.from('0x00', 'hex') // TODO this.getEthPrefixedMessage(proposal.toBuffer())

    const secp256k1Ix = web3.Secp256k1Program.createInstructionWithEthAddress({
      message: prefixedMessage,
      ethAddress: axiaEthAddress,
      signature: Buffer.from(signature),
      recoveryId,
    })

    const ix = await this.program.methods
      .addAxiaSig()
      .accountsPartial({
        solver: this.getSignerKey(),
        solverRegistry: this.getEntityRegistryPubkey(EntityType.Solver, this.getSignerKey()),
        proposal,
        axiaRegistry: this.getEntityRegistryPubkey(EntityType.Axia, axiaEthAddress),
        ixSysvar: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction()

    return [secp256k1Ix, ix]
  }

  getSettlerSettingsPubkey(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([Buffer.from('settler-settings')], this.program.programId)[0]
  }

  getIntentKey(intentHashHex: string): web3.PublicKey {
    const intentHash = Buffer.from(this.parseIntentHashHex(intentHashHex))

    return web3.PublicKey.findProgramAddressSync([Buffer.from('intent'), intentHash], this.program.programId)[0]
  }

  getFulfilledIntentKey(intentHashHex: string): web3.PublicKey {
    const intentHash = Buffer.from(this.parseIntentHashHex(intentHashHex))

    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('fulfilled-intent'), intentHash],
      this.program.programId
    )[0]
  }

  getProposalKey(intentHashHex: string, solverPubkey?: web3.PublicKey): web3.PublicKey {
    this.parseIntentHashHex(intentHashHex)

    const intentKey = this.getIntentKey(intentHashHex)
    const solver = solverPubkey || this.getSignerKey()

    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('proposal'), intentKey.toBuffer(), solver.toBuffer()],
      this.program.programId
    )[0]
  }

  getEntityRegistryPubkey(entityType: EntityType, entityAddress: web3.PublicKey | Buffer): web3.PublicKey {
    const addressBuffer = entityAddress instanceof web3.PublicKey ? entityAddress.toBuffer() : entityAddress
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from('entity-registry'), Buffer.from([entityType]), addressBuffer],
      new web3.PublicKey(ControllerIDL.address)
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

  getEip712Preimage(
    types: Record<string, Array<ethers.TypedDataField>>,
    value: Record<string, any>,
  ): string {
    return ethers.TypedDataEncoder.encode(
      { ...SETTLER_EIP712_DOMAIN, chainId: Chains.Solana },
      INTENT_HASH_VALIDATION_712_TYPES,
      value,
    )
  }

  private parseIntentHashHex(intentHashHex: string): number[] {
    const intentHash = Buffer.from(intentHashHex.slice(2), 'hex')
    if (intentHash.length != 32) throw new Error(`Intent hash must be 32 bytes: ${intentHashHex}`)
    return Array.from(intentHash)
  }

  private parseIntentNonceHex(nonceHex: string): number[] {
    const nonce = Buffer.from(nonceHex.slice(2), 'hex')
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

  private parseProposalInstructions(instructions: ProposalInstruction[]): ProposalInstructionAnchor[] {
    return instructions.map((instruction) => ({
      ...instruction,
      data: typeof instruction.data === 'string' ? Buffer.from(instruction.data, 'hex') : instruction.data,
    }))
  }
}
