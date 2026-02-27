use anchor_lang::prelude::*;

use crate::{
    errors::SettlerError,
    state::{Proposal, ProposalInstruction},
};

#[derive(Accounts)]
#[instruction(more_instructions: Vec<ProposalInstruction>)]
pub struct AddInstructionsToProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// Any proposal
    #[account(
        mut,
        realloc = Proposal::extended_size(proposal.to_account_info().data_len(), &more_instructions)?,
        realloc::payer = creator,
        realloc::zero = true,
        constraint = proposal.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::ProposalIsExpired,
        constraint = !proposal.is_final @ SettlerError::ProposalIsFinal,
        has_one = creator @ SettlerError::IncorrectProposalCreator
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
