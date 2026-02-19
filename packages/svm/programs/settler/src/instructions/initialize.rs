use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{
    constants::DEPLOYER_KEY, controller, errors::SettlerError, state::SettlerSettings,
    types::Eip712Domain,
};

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

pub fn initialize(ctx: Context<Initialize>, domain: Eip712Domain) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.deployer.key(),
        Pubkey::from_str(DEPLOYER_KEY).unwrap(),
        SettlerError::OnlyDeployer,
    );

    let settler_settings = &mut ctx.accounts.settler_settings;

    settler_settings.controller_program = controller::ID;
    settler_settings.bump = ctx.bumps.settler_settings;
    settler_settings.eip712_domain = domain.to_alloy_struct().hash_struct().into();

    Ok(())
}
