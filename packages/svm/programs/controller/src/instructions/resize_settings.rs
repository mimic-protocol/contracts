use anchor_lang::prelude::*;

use crate::utils::resize_account;
use crate::{errors::ControllerError, state::ControllerSettings};

#[derive(Accounts)]
pub struct ResizeSettings<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"controller-settings"],
        bump,
        owner = crate::ID,
    )]
    /// CHECK: Seeds checked in macro, layout and admin checked in instruction body
    pub controller_settings: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

fn check_settings_data(data: &[u8], expected_admin: Pubkey) -> Result<()> {
    if !data.starts_with(&ControllerSettings::DISCRIMINATOR) {
        return Err(ProgramError::InvalidAccountData.into());
    }

    let admin = Pubkey::new_from_array(data[8..40].try_into().unwrap());
    require_keys_eq!(admin, expected_admin, ControllerError::OnlyAdmin);

    Ok(())
}

pub fn resize_settings(ctx: Context<ResizeSettings>) -> Result<()> {
    const EXPECTED_SETTINGS_LEN: usize = 8 + ControllerSettings::INIT_SPACE;
    let controller_settings = &ctx.accounts.controller_settings.to_account_info();

    {
        let data = controller_settings.try_borrow_data()?;
        check_settings_data(&data, ctx.accounts.admin.key())?;
    }

    if controller_settings.data_len() < EXPECTED_SETTINGS_LEN {
        resize_account(
            &ctx.accounts.admin.to_account_info(),
            controller_settings,
            EXPECTED_SETTINGS_LEN,
            &ctx.accounts.system_program.to_account_info(),
        )?;
    }

    Ok(())
}
