use anchor_lang::prelude::*;

use crate::{
    controller::{
        self,
        accounts::{ControllerSettings, EntityRegistry},
        types::EntityType,
    },
    errors::SettlerError,
    state::Intent,
    types::{IntentEvent, OpType, TokenFee},
};

#[derive(Accounts)]
// TODO: can we optimize this deser? we just need the three Vec<T> for their length
#[instruction(intent_hash: [u8; 32], data: Vec<u8>, max_fees: Vec<TokenFee>, events: Vec<IntentEvent>, min_validations: u16)]
pub struct CreateIntent<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8], solver.key().as_ref()],
        bump = solver_registry.bump,
        seeds::program = controller::ID
    )]
    pub solver_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        init,
        seeds = [b"intent", intent_hash.as_ref()],
        bump,
        payer = solver,
        space = Intent::total_size(data.len(), max_fees.len(), &events, min_validations.max(controller_settings.min_validations))?
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

    #[account(
        seeds = [b"controller-settings"],
        bump = controller_settings.bump,
        seeds::program = controller::ID,
    )]
    pub controller_settings: Box<Account<'info, ControllerSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn create_intent(
    ctx: Context<CreateIntent>,
    intent_hash: [u8; 32],
    data: Vec<u8>,
    max_fees: Vec<TokenFee>,
    events: Vec<IntentEvent>,
    min_validations: u16,
    op: OpType,
    user: Pubkey,
    nonce: [u8; 32],
    deadline: u64,
    is_final: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    require!(deadline > now, SettlerError::DeadlineIsInThePast);
    require!(!max_fees.is_empty(), SettlerError::NoMaxFees);

    // TODO: check hash

    let intent = &mut ctx.accounts.intent;
    let controller_min_validations = ctx.accounts.controller_settings.min_validations;

    intent.op = op;
    intent.user = user;
    intent.creator = ctx.accounts.solver.key();
    intent.hash = intent_hash;
    intent.nonce = nonce;
    intent.deadline = deadline;
    intent.min_validations = min_validations.max(controller_min_validations);
    intent.is_final = is_final;
    intent.data = data;
    intent.max_fees = max_fees;
    intent.events = events;
    intent.validators = vec![];
    intent.bump = ctx.bumps.intent;

    Ok(())
}
