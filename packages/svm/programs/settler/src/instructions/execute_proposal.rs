use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ExecuteProposal {

}

pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
    Ok(())
}
