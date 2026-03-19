use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{constants::DEPLOYER_KEY, errors::ControllerError, state::ControllerSettings};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        seeds = [b"controller-settings"],
        bump,
        payer = deployer,
        space = 8 + ControllerSettings::INIT_SPACE
    )]
    pub controller_settings: Box<Account<'info, ControllerSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, min_validations: u16) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.deployer.key(),
        Pubkey::from_str(DEPLOYER_KEY).unwrap(),
        ControllerError::OnlyDeployer,
    );

    require!(
        min_validations > 0,
        ControllerError::MinValidationsCannotBeZero
    );

    let controller_settings = &mut ctx.accounts.controller_settings;

    controller_settings.admin = admin;
    controller_settings.min_validations = min_validations;
    controller_settings.bump = ctx.bumps.controller_settings;

    Ok(())
}
