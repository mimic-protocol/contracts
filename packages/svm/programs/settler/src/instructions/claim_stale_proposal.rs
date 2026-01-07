use anchor_lang::prelude::*;

use crate::{errors::SettlerError, state::Proposal};

#[derive(Accounts)]
pub struct ClaimStaleProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        has_one = creator @ SettlerError::IncorrectProposalCreator,
        constraint = proposal.deadline < Clock::get()?.unix_timestamp as u64 @ SettlerError::ProposalNotYetExpired
    )]
    pub proposal: Box<Account<'info, Proposal>>,
}

pub fn claim_stale_proposal(_ctx: Context<ClaimStaleProposal>) -> Result<()> {
    Ok(())
}
