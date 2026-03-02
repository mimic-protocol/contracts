use anchor_lang::prelude::*;

use crate::{
    controller::{self, accounts::ControllerSettings},
    errors::SettlerError,
    state::SettlerSettings,
    types::Eip712Domain,
};

#[derive(Accounts)]
pub struct UpdateEip712Domain<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"controller-settings"],
        seeds::program = controller::ID,
        bump = controller_settings.bump,
        has_one = admin @ SettlerError::OnlyControllerAdmin,
    )]
    pub controller_settings: Box<Account<'info, ControllerSettings>>,

    #[account(
        mut,
        seeds = [b"settler-settings"],
        bump = settler_settings.bump,
    )]
    pub settler_settings: Box<Account<'info, SettlerSettings>>,
}

pub fn update_eip712_domain(ctx: Context<UpdateEip712Domain>, domain: Eip712Domain) -> Result<()> {
    ctx.accounts.settler_settings.eip712_domain_hash =
        domain.to_alloy_struct().hash_struct().into();

    Ok(())
}
