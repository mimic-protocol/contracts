use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::{Proposal, ProposalInstruction},
};

#[derive(Accounts)]
#[instruction(more_instructions: Vec<ProposalInstruction>)]
pub struct AddInstructionsToProposal<'info> {
    #[account(mut)]
    pub proposal_creator: Signer<'info>,

    #[account(
        mut,
        realloc = Proposal::extended_size(proposal.to_account_info().data_len(), &more_instructions)?,
        realloc::payer = proposal_creator,
        realloc::zero = true,
        has_one = proposal_creator @ SettlerError::IncorrectProposalCreator
    )]

    /// Any proposal
    #[account(
        constraint = proposal.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::ProposalIsExpired,
        constraint = !proposal.is_final @ SettlerError::ProposalIsFinal
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    pub system_program: Program<'info, System>,
}

pub fn add_instructions_to_proposal(
    ctx: Context<AddInstructionsToProposal>,
    more_instructions: Vec<ProposalInstruction>,
    finalize: bool,
) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;

    proposal.instructions.extend_from_slice(&more_instructions);

    if finalize {
        proposal.is_final = true;
    }

    Ok(())
}
