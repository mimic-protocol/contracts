use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateProposal {}

pub fn create_proposal(ctx: Context<CreateProposal>) -> Result<()> {
    Ok(())
}
