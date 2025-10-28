/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Program, Wallet } from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import { Settler } from '../target/types/settler'
import * as SettlerIDL from '../target/idl/settler.json'
import path from 'path'

import { extractLogs } from './utils'

describe('Settler Program', () => {
  let client: any
  let provider: LiteSVMProvider
  let admin: Keypair
  let malicious: Keypair
  let program: Program<Settler>

  before(async () => {
    admin = Keypair.generate()
    malicious = Keypair.generate()
    
    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()
    
    provider = new LiteSVMProvider(client, new Wallet(admin))
    program = new Program<Settler>(SettlerIDL as any, provider)

    // Airdrop initial lamports
    provider.client.airdrop(admin.publicKey, BigInt(100_000_000_000))
    provider.client.airdrop(malicious.publicKey, BigInt(100_000_000_000))
  })

  describe('Settler', () => {
    it('should call initialize', async () => {
      const tx = await program.methods.initialize().transaction()
      tx.recentBlockhash = provider.client.latestBlockhash()
      tx.feePayer = admin.publicKey
      tx.sign(admin)
      const res = provider.client.sendTransaction(tx)

      expect(extractLogs(res.toString()).join('').includes(`Greetings from: ${program.programId.toString()}`)).to.be.ok
    })
  })
})
