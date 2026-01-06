use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{constants::DEPLOYER_KEY, errors::ControllerError, state::GlobalSettings};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        seeds = [b"global-settings"],
        bump,
        payer = deployer,
        space = 8 + GlobalSettings::INIT_SPACE
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.deployer.key(),
        Pubkey::from_str(DEPLOYER_KEY).unwrap(),
        ControllerError::OnlyDeployer,
    );

    let global_settings = &mut ctx.accounts.global_settings;

    global_settings.admin = admin;
    global_settings.bump = ctx.bumps.global_settings;

    Ok(())
}
