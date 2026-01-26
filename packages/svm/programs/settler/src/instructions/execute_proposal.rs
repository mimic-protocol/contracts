use anchor_lang::prelude::*;

use crate::{
    controller::{self, accounts::EntityRegistry, types::EntityType},
    errors::SettlerError,
    state::{FulfilledIntent, Intent, Proposal},
    types::IntentEvent,
};

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8], solver.key().as_ref()],
        bump = solver_registry.bump,
        seeds::program = controller::ID,
    )]
    pub solver_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: account defined in proposal
    #[account(mut)]
    pub proposal_creator: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = intent @ SettlerError::IncorrectIntentForProposal,
        constraint = proposal.creator == proposal_creator.key() @ SettlerError::IncorrectProposalCreator,
        constraint = proposal.is_signed @ SettlerError::ProposalIsNotSigned,
        constraint = proposal.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::ProposalIsExpired,
        close = proposal_creator
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    /// CHECK: account defined in intent
    #[account(mut)]
    pub intent_creator: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = intent.creator == intent_creator.key() @ SettlerError::IncorrectIntentCreator,
        close = intent_creator
    )]
    pub intent: Box<Account<'info, Intent>>,

    #[account(
        init,
        seeds = [b"fulfilled-intent", intent.hash.as_ref()],
        bump,
        space = 8 + FulfilledIntent::INIT_SPACE,
        payer = solver
    )]
    pub fulfilled_intent: Box<Account<'info, FulfilledIntent>>,

    pub system_program: Program<'info, System>,
}

pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
    let intent = &ctx.accounts.intent;

    // TODO: Execute proposal

    // TODO: Validate execution

    // TODO: Emit events
    intent.events.iter().for_each(|event| {
        emit!(IntentEventEvent {
            event: event.clone()
        })
    });

    // TODO: Pay fees to Solver

    Ok(())
}

#[event]
pub struct IntentEventEvent {
    event: IntentEvent,
}
