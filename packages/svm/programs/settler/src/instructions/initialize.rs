use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize {}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    Ok(())
}
