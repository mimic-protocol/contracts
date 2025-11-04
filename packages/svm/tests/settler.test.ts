/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { BN, Program, Wallet } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm'
import { expect } from 'chai'
import fs from 'fs'
import { LiteSVM } from 'litesvm'
import os from 'os'
import path from 'path'

import SettlerSDK from '../sdks/settler/Settler'
import * as SettlerIDL from '../target/idl/settler.json'
import * as WhitelistIDL from '../target/idl/whitelist.json'
import { Settler } from '../target/types/settler'
import { makeTxSignAndSend, warpSeconds } from './utils'
import { OpType } from '../sdks/settler/types'

describe('Settler Program', () => {
  let client: LiteSVM
  let provider: LiteSVMProvider
  let maliciousProvider: LiteSVMProvider
  let admin: Keypair
  let malicious: Keypair
  let program: Program<Settler>
  let sdk: SettlerSDK
  let maliciousSdk: SettlerSDK

  before(async () => {
    admin = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf8')))
    )
    malicious = Keypair.generate()

    client = fromWorkspace(path.join(__dirname, '../')).withBuiltins()

    provider = new LiteSVMProvider(client, new Wallet(admin))
    maliciousProvider = new LiteSVMProvider(client, new Wallet(malicious))

    program = new Program<Settler>(SettlerIDL as any, provider)

    sdk = new SettlerSDK(provider)
    maliciousSdk = new SettlerSDK(maliciousProvider)

    // Airdrop initial lamports
    provider.client.airdrop(admin.publicKey, BigInt(100_000_000_000))
    provider.client.airdrop(malicious.publicKey, BigInt(100_000_000_000))
  })

  beforeEach(() => {
    client.expireBlockhash()
  })

  describe('Settler', () => {
    describe('initialize', () => {
      it('cant initialize if not deployer', async () => {
        const ix = await maliciousSdk.initializeIx()
        const res = await makeTxSignAndSend(maliciousProvider, ix)

        expect(res.toString()).to.include(`Only Deployer can call this instruction.`)
      })

      it('should call initialize', async () => {
        const ix = await sdk.initializeIx()
        await makeTxSignAndSend(provider, ix)

        const settings = await program.account.settlerSettings.fetch(sdk.getSettlerSettingsPubkey())
        expect(settings.whitelistProgram.toString()).to.be.eq(WhitelistIDL.address)
        expect(settings.isPaused).to.be.false
      })

      it('cant call initialize again', async () => {
        const ix = await sdk.initializeIx()
        const res = await makeTxSignAndSend(provider, ix)

        expect(res.toString()).to.include(
          `Allocate: account Address { address: ${sdk.getSettlerSettingsPubkey()}, base: None } already in use`
        )
      })
    })

    describe('create_intent', () => {
    })
  })
})
