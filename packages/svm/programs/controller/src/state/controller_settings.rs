use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ControllerSettings {
    pub admin: Pubkey,
    pub bump: u8,
}
