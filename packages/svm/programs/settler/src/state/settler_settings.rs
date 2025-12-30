use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SettlerSettings {
    pub controller_program: Pubkey,
    pub bump: u8,
}
