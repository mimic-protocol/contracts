use anchor_lang::prelude::*;

use crate::{errors::WhitelistError, state::GlobalSettings};

#[derive(Accounts)]
pub struct SetProposedAdmin<'info> {
    #[account(mut)]
    pub proposed_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-settings"],
        bump = global_settings.bump,
        constraint =
            global_settings.proposed_admin == Some(proposed_admin.key()) @ WhitelistError::OnlyProposedAdmin
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,
}

pub fn set_proposed_admin(ctx: Context<SetProposedAdmin>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let global_settings = &mut ctx.accounts.global_settings;

    let can_change = global_settings.proposed_admin_next_change_timestamp < now;

    match (global_settings.proposed_admin, can_change) {
        (Some(_proposed_admin), true) => {
            emit!(SetProposedAdminEvent {
                old_admin: global_settings.admin,
                new_admin: _proposed_admin,
            });

            global_settings.admin = _proposed_admin;
            global_settings.proposed_admin = None;
            global_settings.proposed_admin_next_change_timestamp = u64::MAX;
        }
        _ => err!(WhitelistError::SetProposedAdminError)?,
    }

    Ok(())
}

#[event]
pub struct SetProposedAdminEvent {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}
