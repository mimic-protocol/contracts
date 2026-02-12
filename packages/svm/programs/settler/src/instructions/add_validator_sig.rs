use anchor_lang::{
    prelude::{instruction::Instruction, sysvar::instructions::get_instruction_relative, *},
    solana_program::sysvar::instructions::ID as IX_ID,
};

use crate::{
    controller::{self, accounts::EntityRegistry, types::EntityType},
    errors::SettlerError,
    state::Intent,
    utils::{
        check_secp256k1_ix, create_intent_hash_eip712_preimage, get_args_from_secp256k1_ix_data,
        Secp256k1Args,
    },
};

#[derive(Accounts)]
pub struct AddValidatorSig<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        seeds = [b"entity-registry", &[EntityType::Solver as u8], solver.key().as_ref()],
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

    #[account(
        seeds = [b"entity-registry", &[EntityType::Validator as u8], validator_registry.entity_address.as_ref()],
        bump = validator_registry.bump,
        seeds::program = controller::ID,
    )]
    pub validator_registry: Box<Account<'info, EntityRegistry>>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

pub fn add_validator_sig(ctx: Context<AddValidatorSig>) -> Result<()> {
    let intent = &mut ctx.accounts.intent;

    // Get Secp256k1 instruction
    let secp256k1_ix: Instruction = get_instruction_relative(-1, &ctx.accounts.ix_sysvar)?;
    let secp256k1_ix_args: Secp256k1Args = get_args_from_secp256k1_ix_data(&secp256k1_ix.data)?;

    // Verify correct program and accounts
    check_secp256k1_ix(&secp256k1_ix)?;

    // Verify correct message was signed
    let expected_message = create_intent_hash_eip712_preimage(&intent.hash);
    require!(
        secp256k1_ix_args.msg == expected_message.as_slice(),
        SettlerError::SigVerificationFailedIncorrectMessage
    );

    // Verify address is a whitelisted Validator
    require!(
        ctx.accounts.validator_registry.entity_address == secp256k1_ix_args.eth_address,
        SettlerError::SigVerificationFailedIncorrectValidator,
    );

    // Updates intent PDA if signature not present and min_validations not met

    if intent.validators.len() == intent.min_validations as usize {
        return Ok(());
    }

    if intent.validators.contains(secp256k1_ix_args.eth_address) {
        return Ok(());
    }

    intent.validators.push(*secp256k1_ix_args.eth_address);

    Ok(())
}
