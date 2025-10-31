use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateProposal {

}

pub fn add_axia_sig(ctx: Context<CreateProposal>) -> Result<()> {
    Ok(())
}
