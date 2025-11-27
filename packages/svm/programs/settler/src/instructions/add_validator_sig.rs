use anchor_lang::{
    prelude::{instruction::Instruction, sysvar::instructions::get_instruction_relative, *},
    solana_program::sysvar::instructions::ID as IX_ID,
};

use crate::{
    errors::SettlerError,
    state::Intent,
    utils::{check_ed25519_ix, get_args_from_ed25519_ix_data, Ed25519Args},
    whitelist::{
        accounts::EntityRegistry,
        types::{EntityType, WhitelistStatus},
    },
};

#[derive(Accounts)]
pub struct AddValidatorSig<'info> {
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

    // Any Intent
    #[account(
        mut,
        constraint = intent.is_final @ SettlerError::IntentIsNotFinal
    )]
    pub intent: Box<Account<'info, Intent>>,

    #[account(
        seeds = [b"fulfilled-intent", intent.intent_hash.as_ref()],
        bump
    )]
    /// This PDA must be uninitialized
    pub fulfilled_intent: SystemAccount<'info>,

    #[account(
        constraint =
            validator_registry.status as u8 == WhitelistStatus::Whitelisted as u8 @ SettlerError::ValidatorNotWhitelisted
    )]
    pub validator_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

pub fn add_validator_sig(ctx: Context<AddValidatorSig>) -> Result<()> {
    // Verify Intent is not expired
    let now = Clock::get()?.unix_timestamp as u64;
    let intent = &mut ctx.accounts.intent;

    require!(intent.deadline > now, SettlerError::IntentIsExpired,);

    // Get Ed25519 instruction
    let ed25519_ix: Instruction = get_instruction_relative(-1, &ctx.accounts.ix_sysvar)?;
    let ed25519_ix_args: Ed25519Args = get_args_from_ed25519_ix_data(&ed25519_ix.data)?;

    // Verify correct program and accounts
    check_ed25519_ix(&ed25519_ix)?;

    // Verify correct message was signed
    if ed25519_ix_args.msg != intent.intent_hash {
        return err!(SettlerError::SigVerificationFailed);
    }

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
            &crate::whitelist::ID,
        )
        .map_err(|_| SettlerError::ValidatorNotWhitelisted)?,
        SettlerError::ValidatorNotWhitelisted,
    );

    // Updates intent PDA if signature not present and min_validations not met

    if intent.validators.len() == intent.min_validations as usize {
        return Ok(());
    }

    let ed25519_pubkey = Pubkey::try_from_slice(ed25519_ix_args.pubkey)?;

    if intent.validators.contains(&ed25519_pubkey) {
        return Ok(());
    }

    intent.validations = intent
        .validations
        .checked_add(1)
        .ok_or(SettlerError::MathError)?;

    intent.validators.push(ed25519_pubkey);

    Ok(())
}
