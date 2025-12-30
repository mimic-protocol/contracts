use anchor_lang::prelude::*;

use crate::{errors::SettlerError, state::Intent};

#[derive(Accounts)]
pub struct ClaimStaleIntent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        has_one = creator @ SettlerError::IncorrectIntentCreator,
        constraint = intent.deadline < Clock::get()?.unix_timestamp as u64 @ SettlerError::IntentNotYetExpired
    )]
    pub intent: Box<Account<'info, Intent>>,
}

pub fn claim_stale_intent(_ctx: Context<ClaimStaleIntent>) -> Result<()> {
    Ok(())
}
