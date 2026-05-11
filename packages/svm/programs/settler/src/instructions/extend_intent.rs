use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::Intent,
    types::{Operation, TokenFee},
};

#[derive(Accounts)]
#[instruction(more_max_fees: Option<Vec<TokenFee>>, more_operations: Option<Vec<Operation>>)]
pub struct ExtendIntent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator @ SettlerError::IncorrectIntentCreator,
        constraint = !intent.is_final @ SettlerError::IntentIsFinal,
        constraint = intent.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::IntentIsExpired,
        realloc =
            Intent::extended_size(
                intent.to_account_info().data_len(),
                &more_max_fees,
                &more_operations
            )?,
        realloc::payer = creator,
        realloc::zero = true
    )]
    pub intent: Box<Account<'info, Intent>>,

    pub system_program: Program<'info, System>,
}

pub fn extend_intent(
    ctx: Context<ExtendIntent>,
    more_max_fees: Option<Vec<TokenFee>>,
    more_operations: Option<Vec<Operation>>,
    finalize: bool,
) -> Result<()> {
    let intent = &mut ctx.accounts.intent;

    if let Some(_more_max_fees) = more_max_fees {
        intent.max_fees.extend_from_slice(&_more_max_fees);
    }

    if let Some(_more_operations) = more_operations {
        intent.operations.extend_from_slice(&_more_operations);
    }

    if finalize {
        intent.is_final = true;
    }

    Ok(())
}
