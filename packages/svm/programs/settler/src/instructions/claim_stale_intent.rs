use anchor_lang::prelude::*;

use crate::{errors::SettlerError, state::Intent};

#[derive(Accounts)]
pub struct ClaimStaleIntent<'info> {
    #[account(mut)]
    pub intent_creator: Signer<'info>,

    #[account(
        mut,
        close = intent_creator,
        has_one = intent_creator @ SettlerError::IncorrectIntentCreator,
    )]
    pub intent: Box<Account<'info, Intent>>,
}

pub fn claim_stale_intent(ctx: Context<ClaimStaleIntent>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    require!(
        ctx.accounts.intent.deadline < now,
        SettlerError::IntentNotYetExpired
    );

    Ok(())
}
