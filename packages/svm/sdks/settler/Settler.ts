import { Program, Provider, web3 } from '@coral-xyz/anchor'

import * as SettlerIDL from '../../target/idl/settler.json'
import { Settler } from '../../target/types/settler'

export default class SettlerSDK {
  protected program: Program<Settler>

  constructor(provider: Provider) {
    this.program = new Program(SettlerIDL, provider)
  }

  async initializeIx(whitelistProgram: web3.PublicKey): Promise<web3.TransactionInstruction> {
    const ix = await this.program.methods.initialize(whitelistProgram).instruction()
    return ix
  }

  getSettlerSettingsPubkey(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([Buffer.from('settler-settings')], this.program.programId)[0]
  }
}
