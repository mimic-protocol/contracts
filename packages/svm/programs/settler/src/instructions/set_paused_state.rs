use anchor_lang::prelude::*;

use crate::state::SettlerSettings;

#[derive(Accounts)]
pub struct SetPausedState<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global-settings"],
        bump = whitelist_program_global_settings.bump,
        seeds::program = settler_settings.whitelist_program,
        has_one = admin @ crate::whitelist::errors::ProgramError::OnlyAdmin
    )]
    pub whitelist_program_global_settings:
        Box<Account<'info, crate::whitelist::accounts::GlobalSettings>>,

    #[account(
        mut,
        seeds = [b"settler-settings"],
        bump = settler_settings.bump
    )]
    pub settler_settings: Box<Account<'info, SettlerSettings>>,
}

pub fn set_paused_state(ctx: Context<SetPausedState>, is_paused: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    ctx.accounts.settler_settings.is_paused = is_paused;

    emit!(SetPausedStateEvent {
        changed_at: now,
        changed_by: ctx.accounts.admin.key(),
        is_paused,
    });

    Ok(())
}

#[event]
pub struct SetPausedStateEvent {
    changed_at: u64,
    changed_by: Pubkey,
    is_paused: bool,
}
