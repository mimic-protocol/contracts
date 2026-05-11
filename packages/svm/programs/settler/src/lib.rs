use anchor_lang::prelude::*;

declare_id!("AcyeAq69xe7JV4F9uwpWzPgyxbxxYUALnYfeMsaDauGR");
declare_program!(controller);

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
        operations: Vec<Operation>,
        max_fees: Vec<TokenFee>,
        min_validations: u16,
        fee_payer: Pubkey,
        nonce: [u8; 32],
        deadline: u64,
        is_final: bool,
    ) -> Result<()> {
        instructions::create_intent(
            ctx,
            intent_hash,
            operations,
            max_fees,
            min_validations,
            fee_payer,
            nonce,
            deadline,
            is_final,
        )
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        instructions: Vec<ProposalInstruction>,
        fees: Vec<u64>,
        deadline: u64,
        is_final: bool,
    ) -> Result<()> {
        instructions::create_proposal(ctx, instructions, fees, deadline, is_final)
    }

    pub fn execute_proposal<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteProposal<'info>>,
    ) -> Result<()> {
        instructions::execute_proposal(ctx)
    }

    pub fn extend_intent(
        ctx: Context<ExtendIntent>,
        more_max_fees: Option<Vec<TokenFee>>,
        more_operations: Option<Vec<Operation>>,
        finalize: bool,
    ) -> Result<()> {
        instructions::extend_intent(ctx, more_max_fees, more_operations, finalize)
    }

    pub fn initialize(ctx: Context<Initialize>, domain: Eip712Domain) -> Result<()> {
        instructions::initialize(ctx, domain)
    }

    pub fn update_eip712_domain(
        ctx: Context<UpdateEip712Domain>,
        domain: Eip712Domain,
    ) -> Result<()> {
        instructions::update_eip712_domain(ctx, domain)
    }
}
