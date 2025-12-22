use anchor_lang::prelude::*;

use crate::{errors::SettlerError, state::Proposal};

#[derive(Accounts)]
pub struct ClaimStaleProposals<'info> {
    #[account(mut)]
    pub proposal_creator: Signer<'info>,
    //
    // remaining_accounts (N):
    //
    // #[account(
    //     mut,
    //     close = proposal_creator,
    //     has_one = proposal_creator @ SettlerError::IncorrectProposalCreator
    // )]
    // pub proposal_n: Box<Account<'info, Proposal>>,
}

pub fn claim_stale_proposals<'info>(
    ctx: Context<'_, '_, 'info, 'info, ClaimStaleProposals<'info>>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let proposal_creator = ctx.accounts.proposal_creator.to_account_info();

    for account_info in ctx.remaining_accounts {
        let proposal: Box<Account<'info, Proposal>> =
            Box::new(Account::<Proposal>::try_from(account_info)?);

        require_keys_eq!(
            proposal.proposal_creator,
            proposal_creator.key(),
            SettlerError::IncorrectProposalCreator
        );
        require!(now > proposal.deadline, SettlerError::ProposalNotYetExpired);

        proposal.close(ctx.accounts.proposal_creator.to_account_info())?;
    }

    Ok(())
}
