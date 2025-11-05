use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::Intent,
    types::{IntentEvent, MaxFee, OpType},
    whitelist::{
        accounts::EntityRegistry,
        types::{EntityType, WhitelistStatus},
    },
};

#[derive(Accounts)]
// TODO: can we optimize this deser? we just need the three Vec<T> for their length
#[instruction(intent_hash: [u8; 32], data: Vec<u8>, max_fees: Vec<MaxFee>, events: Vec<IntentEvent>)]
pub struct CreateIntent<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8 + 1], solver.key().as_ref()],
        bump = solver_registry.bump,
        seeds::program = crate::whitelist::ID,
        constraint =
            solver_registry.status as u8 == WhitelistStatus::Whitelisted as u8 @ SettlerError::OnlySolver
    )]
    pub solver_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        init,
        seeds = [b"intent", intent_hash.as_ref()],
        bump,
        payer = solver,
        space = 8 + Intent::BASE_LEN + Intent::data_size(data.len()) + Intent::max_fees_size(max_fees.len()) + Intent::events_size(&events)
    )]
    // TODO: change to AccountLoader?
    // TODO: init within the handler body to save compute?
    pub intent: Box<Account<'info, Intent>>,

    #[account(
        seeds = [b"fulfilled-intent", intent_hash.as_ref()],
        bump
    )]
    /// This PDA must be uninitialized
    pub fulfilled_intent: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_intent(
    ctx: Context<CreateIntent>,
    intent_hash: [u8; 32],
    data: Vec<u8>,
    max_fees: Vec<MaxFee>,
    events: Vec<IntentEvent>,
    op: OpType,
    user: Pubkey,
    nonce: [u8; 32],
    deadline: u64,
    min_validations: u16,
    is_final: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    require!(deadline > now, SettlerError::DeadlineIsInThePast);

    // TODO: check hash

    let intent = &mut ctx.accounts.intent;

    intent.op = op;
    intent.user = user;
    intent.intent_creator = ctx.accounts.solver.key();
    intent.intent_hash = intent_hash;
    intent.nonce = nonce;
    intent.deadline = deadline;
    intent.min_validations = min_validations;
    intent.validations = 0;
    intent.is_final = is_final;
    intent.intent_data = data;
    intent.max_fees = max_fees;
    intent.events = events;
    intent.bump = ctx.bumps.intent;

    Ok(())
}
