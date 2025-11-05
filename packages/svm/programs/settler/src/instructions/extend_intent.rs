use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::Intent,
    types::{IntentEvent, MaxFee},
};

#[derive(Accounts)]
#[instruction(more_data: Option<Vec<u8>>, more_max_fees: Option<Vec<MaxFee>>, more_events: Option<Vec<IntentEvent>>)]
pub struct ExtendIntent<'info> {
    #[account(mut)]
    pub intent_creator: Signer<'info>,

    #[account(
        mut,
        has_one = intent_creator @ SettlerError::IncorrectIntentCreator,
        constraint = !intent.is_final @ SettlerError::IntentIsFinal,
        realloc =
            intent.extended_size(intent.to_account_info().data_len(), &more_data, &more_max_fees, &more_events)?,
        realloc::payer = intent_creator,
        realloc::zero = true
    )]
    pub intent: Box<Account<'info, Intent>>,

    pub system_program: Program<'info, System>,
}

pub fn extend_intent(
    ctx: Context<ExtendIntent>,
    more_data: Option<Vec<u8>>,
    more_max_fees: Option<Vec<MaxFee>>,
    more_events: Option<Vec<IntentEvent>>,
    finalize: bool,
) -> Result<()> {
    let intent = &mut ctx.accounts.intent;

    if let Some(_more_data) = more_data {
        intent.intent_data.extend_from_slice(&_more_data);
    }

    if let Some(_more_max_fees) = more_max_fees {
        intent.max_fees.extend_from_slice(&_more_max_fees);
    }

    if let Some(_more_events) = more_events {
        intent.events.extend_from_slice(&_more_events);
    }

    if finalize {
        intent.is_final = true;
    }

    Ok(())
}
