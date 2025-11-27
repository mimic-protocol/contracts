use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{
    constants::{DEPLOYER_KEY, MAX_COOLDOWN},
    errors::WhitelistError,
    state::GlobalSettings,
};

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

pub fn initialize(
    ctx: Context<Initialize>,
    admin: Pubkey,
    proposed_admin_cooldown: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.deployer.key(),
        Pubkey::from_str(DEPLOYER_KEY).unwrap(),
        WhitelistError::OnlyDeployer,
    );

    require!(
        proposed_admin_cooldown > 0,
        WhitelistError::CooldownCantBeZero,
    );

    require!(
        proposed_admin_cooldown <= MAX_COOLDOWN,
        WhitelistError::CooldownTooLarge,
    );

    let global_settings = &mut ctx.accounts.global_settings;

    global_settings.admin = admin;
    global_settings.proposed_admin = None;
    global_settings.proposed_admin_cooldown = proposed_admin_cooldown;
    global_settings.proposed_admin_next_change_timestamp = u64::MAX;
    global_settings.bump = ctx.bumps.global_settings;

    Ok(())
}
