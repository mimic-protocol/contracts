import { web3 } from '@coral-xyz/anchor'
import { LiteSVMProvider } from 'anchor-litesvm'
import { Clock, FailedTransactionMetadata, TransactionMetadata } from 'litesvm'

export async function signAndSendTx(
  provider: LiteSVMProvider,
  tx: web3.Transaction
): Promise<TransactionMetadata | FailedTransactionMetadata> {
  tx.recentBlockhash = provider.client.latestBlockhash()
  tx.feePayer = provider.wallet.publicKey
  const stx = await provider.wallet.signTransaction(tx)
  return provider.client.sendTransaction(stx)
}

export function makeTx(...ixs: web3.TransactionInstruction[]): web3.Transaction {
  return new web3.Transaction().add(...ixs)
}

export async function makeTxSignAndSend(
  provider: LiteSVMProvider,
  ...ixs: web3.TransactionInstruction[]
): Promise<TransactionMetadata | FailedTransactionMetadata> {
  return signAndSendTx(provider, makeTx(...ixs))
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
