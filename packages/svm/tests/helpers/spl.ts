import { Address, translateAddress, web3 } from '@coral-xyz/anchor'
import {
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { LiteSVMProvider } from 'anchor-litesvm'
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm'

import { makeTx, makeTxSignAndSend } from '../utils'
import { randomKeypair } from './misc'

export type CreateMintParams = {
  decimals: number
  freezeAuthority: Address | null
  programId?: Address
}

export type CreateMintResult = {
  mint: web3.PublicKey
  res: TransactionMetadata | FailedTransactionMetadata
}

const DEFAULT_CREATE_MINT_PARAMS: CreateMintParams = {
  decimals: 9,
  freezeAuthority: null,
}

export function createMint(
  client: LiteSVM,
  mintAuthority: web3.Keypair,
  params: Partial<CreateMintParams>
): CreateMintResult {
  const mint = randomKeypair()
  const { decimals, freezeAuthority, programId } = { ...DEFAULT_CREATE_MINT_PARAMS, ...params }
  const tokenProgramId = translateAddress(programId ?? TOKEN_PROGRAM_ID)

  const createMintAccountIx = web3.SystemProgram.createAccount({
    fromPubkey: mintAuthority.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports: Number(client.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
    programId: tokenProgramId,
  })

  const initializeMintIx = createInitializeMint2Instruction(
    mint.publicKey,
    decimals,
    mintAuthority.publicKey,
    freezeAuthority ? translateAddress(freezeAuthority) : null,
    tokenProgramId
  )

  const tx = makeTx(createMintAccountIx, initializeMintIx)
  tx.recentBlockhash = client.latestBlockhash()
  tx.feePayer = mintAuthority.publicKey
  tx.sign(mintAuthority, mint)

  return { mint: mint.publicKey, res: client.sendTransaction(tx) }
}

export type CreatFundedAtaResult = {
  ata: web3.PublicKey
  res: TransactionMetadata | FailedTransactionMetadata
}

export async function createFundedAta(
  provider: LiteSVMProvider,
  admin: web3.Keypair,
  wallet: Address,
  mint: Address,
  amount: number,
  programId?: Address
): Promise<CreatFundedAtaResult> {
  const mintKey = translateAddress(mint)
  const walletKey = translateAddress(wallet)
  const ata = getAssociatedTokenAddressSync(
    mintKey,
    walletKey,
    true,
    programId ? translateAddress(programId) : undefined
  )

  const ixs = [createAssociatedTokenAccountInstruction(admin.publicKey, ata, walletKey, mintKey)]
  if (amount > 0) ixs.push(createMintToInstruction(mintKey, ata, admin.publicKey, amount))

  const res = await makeTxSignAndSend(provider, ...ixs)

  return { ata, res }
}

export async function approveDelegate(
  provider: LiteSVMProvider,
  ata: Address,
  delegate: Address,
  owner: web3.Keypair,
  amount: number
): Promise<TransactionMetadata | FailedTransactionMetadata> {
  const ix = createApproveInstruction(translateAddress(ata), translateAddress(delegate), owner.publicKey, amount)
  return makeTxSignAndSend(provider, ix)
}
