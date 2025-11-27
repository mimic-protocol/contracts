use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{constants::DEPLOYER_KEY, errors::SettlerError, state::SettlerSettings};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,

    #[account(
        init,
        seeds = [b"settler-settings"],
        bump,
        payer = deployer,
        space = 8 + SettlerSettings::INIT_SPACE,
    )]
    pub settler_settings: Box<Account<'info, SettlerSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.deployer.key(),
        Pubkey::from_str(DEPLOYER_KEY).unwrap(),
        SettlerError::OnlyDeployer,
    );

    let settler_settings = &mut ctx.accounts.settler_settings;

    settler_settings.whitelist_program = crate::whitelist::ID;
    settler_settings.is_paused = false;
    settler_settings.bump = ctx.bumps.settler_settings;

    Ok(())
}
