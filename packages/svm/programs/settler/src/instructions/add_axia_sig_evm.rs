use anchor_lang::{
    prelude::{instruction::Instruction, sysvar::instructions::get_instruction_relative, *},
    solana_program::sysvar::instructions::ID as IX_ID,
};

use crate::{
    controller::{self, accounts::EntityRegistry, types::EntityType},
    errors::SettlerError,
    state::Proposal,
    utils::{check_secp256k1_ix, get_args_from_secp256k1_ix_data, Secp256k1Args},
};

#[derive(Accounts)]
pub struct AddAxiaSigEvm<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8], solver.key().as_ref()],
        bump = solver_registry.bump,
        seeds::program = controller::ID,
    )]
    pub solver_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Axia as u8], axia_registry.entity_pubkey.as_ref()],
        bump = axia_registry.bump,
        seeds::program = controller::ID,
    )]
    pub axia_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: Any proposal
    #[account(
        mut,
        constraint = proposal.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::ProposalIsExpired,
        constraint = proposal.is_final @ SettlerError::ProposalIsNotFinal,
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

pub fn add_axia_sig_evm(ctx: Context<AddAxiaSigEvm>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;

    // NOP if already signed
    if proposal.is_signed {
        return Ok(());
    }

    // Get Secp256k1 instruction
    let secp256k1_ix: Instruction = get_instruction_relative(-1, &ctx.accounts.ix_sysvar)?;
    let secp256k1_ix_args: Secp256k1Args = get_args_from_secp256k1_ix_data(&secp256k1_ix.data)?;

    // Verify correct program and accounts
    check_secp256k1_ix(&secp256k1_ix)?;

    // Verify correct message was signed
    require!(
        secp256k1_ix_args.msg == proposal.key().as_array(),
        SettlerError::SigVerificationFailed
    );

    // Verify pubkey is whitelisted Axia
    // require!(
    //     secp256k1_ix_args.eth_address == &ctx.accounts.axia_registry.entity_pubkey.to_bytes(),
    //     SettlerError::AxiaNotAllowlisted
    // );

    // Updates proposal as signed
    proposal.is_signed = true;

    Ok(())
}
