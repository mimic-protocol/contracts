use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ExecuteProposal {

}

pub fn add_axia_sig(ctx: Context<ExecuteProposal>) -> Result<()> {
    Ok(())
}
