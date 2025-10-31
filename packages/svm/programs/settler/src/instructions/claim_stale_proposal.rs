use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimStaleProposal {

}

pub fn add_axia_sig(ctx: Context<ClaimStaleProposal>) -> Result<()> {
    Ok(())
}
