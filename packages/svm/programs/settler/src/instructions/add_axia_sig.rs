use anchor_lang::{
    prelude::{instruction::Instruction, sysvar::instructions::get_instruction_relative, *},
    solana_program::sysvar::instructions::ID as IX_ID,
};

use crate::{
    errors::SettlerError,
    state::Proposal,
    utils::{check_ed25519_ix, get_args_from_ed25519_ix_data, Ed25519Args},
    whitelist::{
        accounts::EntityRegistry,
        types::{EntityType, WhitelistStatus},
    },
};

#[derive(Accounts)]
pub struct AddAxiaSig<'info> {
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

    #[account(
        seeds = [b"entity-registry", &[EntityType::Axia as u8 + 1], axia_registry.entity_pubkey.as_ref()],
        bump = axia_registry.bump,
        seeds::program = crate::whitelist::ID,
        constraint =
            axia_registry.status as u8 == WhitelistStatus::Whitelisted as u8 @ SettlerError::AxiaNotWhitelisted,
        constraint = axia_registry.entity_type as u8 == EntityType::Axia as u8 @ SettlerError::AxiaNotWhitelisted,
    )]
    pub axia_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: Any proposal
    #[account(mut)]
    pub proposal: Box<Account<'info, Proposal>>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

pub fn add_axia_sig(ctx: Context<AddAxiaSig>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;

    // NOP if already signed
    if proposal.is_signed {
        return Ok(());
    }

    let now = Clock::get()?.unix_timestamp as u64;

    require!(proposal.deadline > now, SettlerError::ProposalIsExpired);
    require!(proposal.is_final, SettlerError::ProposalIsNotFinal);

    // Get Ed25519 instruction
    let ed25519_ix: Instruction = get_instruction_relative(-1, &ctx.accounts.ix_sysvar)?;
    let ed25519_ix_args: Ed25519Args = get_args_from_ed25519_ix_data(&ed25519_ix.data)?;

    // Verify correct program and accounts
    check_ed25519_ix(&ed25519_ix)?;

    // Verify correct message was signed
    if ed25519_ix_args.msg != proposal.key().as_array() {
        return err!(SettlerError::SigVerificationFailed);
    }

    // Verify pubkey is whitelisted Axia
    if ed25519_ix_args.pubkey != &ctx.accounts.axia_registry.entity_pubkey.to_bytes() {
        return err!(SettlerError::AxiaNotWhitelisted);
    }

    // Updates proposal as signed
    proposal.is_signed = true;

    Ok(())
}
