use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ChangeWhitelistProgram {}

pub fn change_whitelist_program(ctx: Context<ChangeWhitelistProgram>) -> Result<()> {
    // TODO: check against crate::whitelist::ID
    Ok(())
}
