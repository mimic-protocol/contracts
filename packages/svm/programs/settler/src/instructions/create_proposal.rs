use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::{Intent, Proposal, ProposalInstruction},
    types::TokenFee,
    whitelist::{
        accounts::EntityRegistry,
        types::{EntityType, WhitelistStatus},
    },
};

#[derive(Accounts)]
#[instruction(instructions: Vec<ProposalInstruction>, fees: Vec<TokenFee>,)]
pub struct CreateProposal<'info> {
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

    /// Any intent
    pub intent: Box<Account<'info, Intent>>,

    #[account(
        seeds = [b"fulfilled-intent", intent.intent_hash.as_ref()],
        bump
    )]
    /// This PDA must be uninitialized
    pub fulfilled_intent: SystemAccount<'info>,

    #[account(
        init,
        seeds = [b"proposal", intent.key().as_ref(), solver.key().as_ref()],
        bump,
        payer = solver,
        space = Proposal::total_size(&instructions, fees.len())?
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    pub system_program: Program<'info, System>,
}

pub fn create_proposal(
    ctx: Context<CreateProposal>,
    instructions: Vec<ProposalInstruction>,
    fees: Vec<TokenFee>,
    deadline: u64,
    is_final: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let intent = &ctx.accounts.intent;

    require!(deadline > now, SettlerError::DeadlineIsInThePast);
    require!(intent.deadline > now, SettlerError::IntentIsExpired);
    require!(
        deadline <= intent.deadline,
        SettlerError::ProposalDeadlineExceedsIntentDeadline
    );
    require!(
        intent.validations >= intent.min_validations,
        SettlerError::InsufficientIntentValidations
    );
    require!(intent.is_final, SettlerError::IntentIsNotFinal);
    require!(
        fees.len() == intent.max_fees.len(),
        SettlerError::InvalidFeeMint
    );

    fees.iter()
        .zip(&intent.max_fees)
        .try_for_each(|(fee, max_fee)| {
            require_keys_eq!(fee.mint, max_fee.mint, SettlerError::InvalidFeeMint);
            require_gte!(
                max_fee.amount,
                fee.amount,
                SettlerError::FeeAmountExceedsMaxFee
            );
            Ok(())
        })?;

    let proposal = &mut ctx.accounts.proposal;

    proposal.intent = intent.key();
    proposal.proposal_creator = ctx.accounts.solver.key();
    proposal.deadline = deadline;
    proposal.is_final = is_final;
    proposal.is_signed = false;
    proposal.instructions = instructions;
    proposal.fees = fees;
    proposal.bump = ctx.bumps.proposal;

    Ok(())
}
