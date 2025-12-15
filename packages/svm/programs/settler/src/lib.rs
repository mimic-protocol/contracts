use anchor_lang::prelude::*;

declare_id!("HbNt35Ng8aM4NUy39evpCQqXEC4Nmaq16ewY8dyNF6NF");
declare_program!(whitelist);

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;
pub mod utils;

use crate::{instructions::*, state::*, types::*};

#[program]
pub mod settler {
    use super::*;

    pub fn add_axia_sig(ctx: Context<AddAxiaSig>) -> Result<()> {
        instructions::add_axia_sig(ctx)
    }

    pub fn add_instructions_to_proposal(
        ctx: Context<AddInstructionsToProposal>,
        more_instructions: Vec<ProposalInstruction>,
        finalize: bool,
    ) -> Result<()> {
        instructions::add_instructions_to_proposal(ctx, more_instructions, finalize)
    }

    pub fn add_validator_sig(ctx: Context<AddValidatorSig>) -> Result<()> {
        instructions::add_validator_sig(ctx)
    }

    pub fn change_whitelist_program(ctx: Context<ChangeWhitelistProgram>) -> Result<()> {
        instructions::change_whitelist_program(ctx)
    }

    pub fn claim_stale_intent(ctx: Context<ClaimStaleIntent>) -> Result<()> {
        instructions::claim_stale_intent(ctx)
    }

    pub fn claim_stale_proposal<'info>(
        ctx: Context<'_, '_, 'info, 'info, ClaimStaleProposal<'info>>,
    ) -> Result<()> {
        instructions::claim_stale_proposal(ctx)
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

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        instructions: Vec<ProposalInstruction>,
        fees: Vec<TokenFee>,
        deadline: u64,
        is_final: bool,
    ) -> Result<()> {
        instructions::create_proposal(ctx, instructions, fees, deadline, is_final)
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::execute_proposal(ctx)
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
