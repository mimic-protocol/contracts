use anchor_lang::prelude::*;

use crate::{errors::WhitelistError, state::GlobalSettings};

#[derive(Accounts)]
pub struct ProposeAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"global-settings"],
        bump = global_settings.bump,
        has_one = admin @ WhitelistError::OnlyAdmin
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,
}

pub fn propose_admin(ctx: Context<ProposeAdmin>, proposed_admin: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let global_settings = &mut ctx.accounts.global_settings;

    if global_settings.proposed_admin != None {
        err!(WhitelistError::ProposedAdminIsAlreadySet)?;
    }

    global_settings.proposed_admin = Some(proposed_admin);
    global_settings.proposed_admin_next_change_timestamp = now
        .checked_add(global_settings.proposed_admin_cooldown)
        .ok_or(WhitelistError::MathError)?;

    Ok(())
}
