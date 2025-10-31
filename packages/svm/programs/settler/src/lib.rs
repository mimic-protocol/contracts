#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("HbNt35Ng8aM4NUy39evpCQqXEC4Nmaq16ewY8dyNF6NF");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;

use crate::instructions::*;

#[program]
pub mod settler {
    use super::*;

    pub fn add_axia_sig(ctx: Context<AddAxiaSig>) -> Result<()> {
        instructions::add_axia_sig(ctx)
    }

    pub fn add_instructions_to_proposal(ctx: Context<AddInstructionsToProposal>) -> Result<()> {
        instructions::add_instructions_to_proposal(ctx)
    }

    pub fn add_validator_sigs(ctx: Context<AddValidatorSigs>) -> Result<()> {
        instructions::add_validator_sigs(ctx)
    }

    pub fn change_whitelist_program(ctx: Context<ChangeWhitelistProgram>) -> Result<()> {
        instructions::change_whitelist_program(ctx)
    }

    pub fn claim_stale_proposal(ctx: Context<ClaimStaleProposal>) -> Result<()> {
        instructions::claim_stale_proposal(ctx)
    }

    pub fn create_intent(ctx: Context<CreateIntent>) -> Result<()> {
        instructions::create_intent(ctx)
    }

    pub fn create_proposal(ctx: Context<CreateProposal>) -> Result<()> {
        instructions::create_proposal(ctx)
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::execute_proposal(ctx)
    }

    pub fn initialize(ctx: Context<Initialize>, whitelist_program: Pubkey) -> Result<()> {
        instructions::initialize(ctx, whitelist_program)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause(ctx)
    }
}
