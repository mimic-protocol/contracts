import {
  Account as SPLAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from '@solana/spl-token'
import { AccountInfo, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { LiteSVMProvider } from 'anchor-litesvm'
import { AccountInfoBytes, Clock } from 'litesvm'

export function extractLogs(liteSvmTxMetadataString: string): string[] {
  const logsMatch = liteSvmTxMetadataString.match(/logs: \[(.*?)\],/s)
  if (!logsMatch) return []

  return logsMatch[1].split('", "')
}

export function getAtaBalance(provider: LiteSVMProvider, address: PublicKey): number {
  const ata = getAndUnpackAta(provider, address)
  return Number(ata?.amount ?? 0)
}

export function getAndUnpackAta(provider: LiteSVMProvider, address: PublicKey): SPLAccount | null {
  const account = provider.client.getAccount(address)
  if (!account) return null
  return unpackAccount(address, {
    ...account,
    data: Buffer.from(account?.data),
  })
}

export function toAccountInfo(stuff: AccountInfoBytes | null): AccountInfo<Buffer> | null {
  return stuff
    ? {
        executable: stuff.executable,
        data: Buffer.from(stuff.data),
        lamports: stuff.lamports,
        owner: stuff.owner,
        rentEpoch: stuff.rentEpoch,
      }
    : null
}

export async function createMint(provider: LiteSVMProvider, mintAuthority: Keypair, decimals = 9): Promise<PublicKey> {
  const mint = Keypair.generate()
  const lamports = provider.client.minimumBalanceForRentExemption(BigInt(MINT_SIZE))
  const initAccountIx = SystemProgram.createAccount({
    fromPubkey: mintAuthority.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports: Number(lamports),
    programId: TOKEN_PROGRAM_ID,
  })
  const mintIx = createInitializeMint2Instruction(mint.publicKey, decimals, mintAuthority.publicKey, null)
  const tx = new Transaction().add(initAccountIx).add(mintIx)
  tx.recentBlockhash = provider.client.latestBlockhash()
  tx.feePayer = mintAuthority.publicKey
  tx.sign(mintAuthority, mint)
  provider.client.sendTransaction(tx)

  return mint.publicKey
}

export function createMintTokensToIxs(
  mintAuthority: PublicKey,
  mints: { mint: PublicKey; authority: PublicKey }[],
  amount: number
): TransactionInstruction[] {
  return mints
    .map(({ mint, authority }) => {
      const ata = getAssociatedTokenAddressSync(mint, authority, true)
      return [
        createAssociatedTokenAccountIdempotentInstruction(mintAuthority, ata, authority, mint),
        createMintToInstruction(mint, ata, mintAuthority, amount),
      ]
    })
    .flat()
}

export function warpSeconds(provider: LiteSVMProvider, seconds: number): void {
  const clock = provider.client.getClock()
  provider.client.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(seconds)
    )
  )
}
