use anchor_lang::prelude::*;

declare_id!("HbNt35Ng8aM4NUy39evpCQqXEC4Nmaq16ewY8dyNF6NF");
declare_program!(whitelist);

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;
pub mod utils;

use crate::{instructions::*, types::*};

#[program]
pub mod settler {
    use super::*;

    pub fn claim_stale_intent(ctx: Context<ClaimStaleIntent>) -> Result<()> {
        instructions::claim_stale_intent(ctx)
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
        instructions::create_intent(
            ctx,
            intent_hash,
            data,
            max_fees,
            events,
            min_validations,
            op,
            user,
            nonce,
            deadline,
            is_final,
        )
    }

    pub fn extend_intent(
        ctx: Context<ExtendIntent>,
        more_data: Option<Vec<u8>>,
        more_max_fees: Option<Vec<TokenFee>>,
        more_events: Option<Vec<IntentEvent>>,
        finalize: bool,
    ) -> Result<()> {
        instructions::extend_intent(ctx, more_data, more_max_fees, more_events, finalize)
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn set_paused_state(ctx: Context<SetPausedState>, is_paused: bool) -> Result<()> {
        instructions::set_paused_state(ctx, is_paused)
    }
}
