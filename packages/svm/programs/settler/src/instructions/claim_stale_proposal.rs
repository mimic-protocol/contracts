use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimStaleProposal {

}

pub fn claim_stale_proposal(ctx: Context<ClaimStaleProposal>) -> Result<()> {
    Ok(())
}
