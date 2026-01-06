use anchor_lang::prelude::*;

use crate::{errors::ControllerError, state::ControllerSettings};

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"controller-settings"],
        bump = controller_settings.bump,
        has_one = admin @ ControllerError::OnlyAdmin
    )]
    pub controller_settings: Box<Account<'info, ControllerSettings>>,
}

pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
    let controller_settings = &mut ctx.accounts.controller_settings;

    controller_settings.admin = new_admin;

    emit!(SetAdminEvent {
        new_admin,
        timestamp: Clock::get()?.unix_timestamp as u64,
    });

    Ok(())
}

#[event]
pub struct SetAdminEvent {
    pub new_admin: Pubkey,
    pub timestamp: u64,
}
