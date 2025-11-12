#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("HbNt35Ng8aM4NUy39evpCQqXEC4Nmaq16ewY8dyNF6NF");

#[program]
pub mod settler {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
