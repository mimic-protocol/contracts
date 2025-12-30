use anchor_lang::prelude::*;

use crate::{errors::ControllerError, state::GlobalSettings};

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-settings"],
        bump = global_settings.bump,
        has_one = admin @ ControllerError::OnlyAdmin
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,
}

pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
    let global_settings = &mut ctx.accounts.global_settings;

    global_settings.admin = new_admin;

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
