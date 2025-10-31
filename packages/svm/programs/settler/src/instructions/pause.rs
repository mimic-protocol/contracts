use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause {}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    Ok(())
}
