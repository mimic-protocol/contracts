use anchor_lang::prelude::*;

use crate::{errors::ControllerError, state::ControllerSettings};

#[derive(Accounts)]
pub struct SetMinValidations<'info> {
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

pub fn set_min_validations(
    ctx: Context<SetMinValidations>,
    new_min_validations: u16,
) -> Result<()> {
    require!(
        new_min_validations > 0,
        ControllerError::MinValidationsCannotBeZero
    );

    let controller_settings = &mut ctx.accounts.controller_settings;

    controller_settings.min_validations = new_min_validations;

    emit!(SetMinValidationsEvent {
        new_min_validations,
        timestamp: Clock::get()?.unix_timestamp as u64,
    });

    Ok(())
}

#[event]
pub struct SetMinValidationsEvent {
    pub new_min_validations: u16,
    pub timestamp: u64,
}
