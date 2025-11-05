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
        realloc = Proposal::extended_size(proposal.to_account_info().data_len(), &more_instructions),
        realloc::payer = proposal_creator,
        realloc::zero = true,
        has_one = proposal_creator @ SettlerError::IncorrectProposalCreator
    )]
    // Any proposal
    pub proposal: Box<Account<'info, Proposal>>,

    pub system_program: Program<'info, System>,
}

pub fn add_instructions_to_proposal(
    ctx: Context<AddInstructionsToProposal>,
    more_instructions: Vec<ProposalInstruction>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let proposal = &mut ctx.accounts.proposal;

    require!(proposal.deadline > now, SettlerError::ProposalIsExpired);
    require!(!proposal.is_final, SettlerError::ProposalIsFinal);

    proposal.instructions.extend_from_slice(&more_instructions);

    Ok(())
}
