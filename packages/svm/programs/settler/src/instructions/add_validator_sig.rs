use anchor_lang::{
    prelude::{instruction::Instruction, sysvar::instructions::get_instruction_relative, *},
    solana_program::sysvar::instructions::ID as IX_ID,
};

use crate::{
    controller::{self, accounts::EntityRegistry, types::EntityType},
    errors::SettlerError,
    state::Intent,
    utils::{check_ed25519_ix, get_args_from_ed25519_ix_data, Ed25519Args},
};

#[derive(Accounts)]
pub struct AddValidatorSig<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8 + 1], solver.key().as_ref()],
        bump = solver_registry.bump,
        seeds::program = controller::ID,
    )]
    pub solver_registry: Box<Account<'info, EntityRegistry>>,

    // Any Intent
    #[account(
        mut,
        constraint = intent.deadline > Clock::get()?.unix_timestamp as u64 @ SettlerError::IntentIsExpired,
        constraint = intent.is_final @ SettlerError::IntentIsNotFinal
    )]
    pub intent: Box<Account<'info, Intent>>,

    #[account(
        seeds = [b"fulfilled-intent", intent.hash.as_ref()],
        bump
    )]
    /// This PDA must be uninitialized
    pub fulfilled_intent: SystemAccount<'info>,

    /// CHECK: other checks in ix body
    pub validator_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

pub fn add_validator_sig(ctx: Context<AddValidatorSig>) -> Result<()> {
    let intent = &mut ctx.accounts.intent;

    // Get Ed25519 instruction
    let ed25519_ix: Instruction = get_instruction_relative(-1, &ctx.accounts.ix_sysvar)?;
    let ed25519_ix_args: Ed25519Args = get_args_from_ed25519_ix_data(&ed25519_ix.data)?;

    // Verify correct program and accounts
    check_ed25519_ix(&ed25519_ix)?;

    // Verify correct message was signed
    require!(
        ed25519_ix_args.msg == intent.hash,
        SettlerError::SigVerificationFailed
    );

    // Verify pubkey is a whitelisted Validator
    require_keys_eq!(
        ctx.accounts.validator_registry.key(),
        Pubkey::create_program_address(
            &[
                b"entity-registry",
                &[EntityType::Validator as u8 + 1],
                ed25519_ix_args.pubkey,
                &[ctx.accounts.validator_registry.bump]
            ],
            &controller::ID,
        )
        .map_err(|_| SettlerError::ValidatorNotAllowlisted)?,
        SettlerError::ValidatorNotAllowlisted,
    );

    // Updates intent PDA if signature not present and min_validations not met

    if intent.validators.len() == intent.min_validations as usize {
        return Ok(());
    }

    let ed25519_pubkey = Pubkey::try_from_slice(ed25519_ix_args.pubkey)?;

    if intent.validators.contains(&ed25519_pubkey) {
        return Ok(());
    }

    intent.validators.push(ed25519_pubkey);

    Ok(())
}
