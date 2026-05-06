use anchor_lang::prelude::*;

use crate::{
    controller::{self, accounts::EntityRegistry, types::EntityType},
    errors::SettlerError,
    state::{FulfilledIntent, Intent, Proposal},
    types::OperationEvent,
    utils::{handle_intent_execution, pay_solver_fees},
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
        constraint = intent.is_final @ SettlerError::IntentIsNotFinal,
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

    #[account(seeds = [b"delegate", intent.user.key().as_ref()], bump)]
    pub delegate: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn execute_proposal<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteProposal<'info>>,
) -> Result<()> {
    let intent = &ctx.accounts.intent;
    let proposal = &ctx.accounts.proposal;

    let mut remaining_accounts_iter = ctx.remaining_accounts.iter();
    let token_program = next_account_info(&mut remaining_accounts_iter)?;
    let token_2022_program = next_account_info(&mut remaining_accounts_iter)?;

    require_keys_eq!(
        token_program.key(),
        anchor_spl::token::ID,
        SettlerError::IncorrectTokenProgram
    );
    require_keys_eq!(
        token_2022_program.key(),
        anchor_spl::token_2022::ID,
        SettlerError::IncorrectTokenProgram
    );

    handle_intent_execution(
        intent,
        proposal,
        &ctx.accounts.delegate.clone(),
        &mut remaining_accounts_iter,
        token_program,
        token_2022_program,
        ctx.bumps.delegate,
    )?;

    intent.events.iter().for_each(|event| {
        emit!(IntentEventEvent {
            event: event.clone()
        })
    });

    pay_solver_fees(
        &mut remaining_accounts_iter,
        intent,
        proposal,
        token_program,
        token_2022_program,
        &ctx.accounts.delegate.clone(),
        ctx.bumps.delegate,
    )?;

    Ok(())
}

#[event]
pub struct IntentEventEvent {
    event: OperationEvent,
}
