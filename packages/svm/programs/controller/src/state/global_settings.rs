use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalSettings {
    pub admin: Pubkey,
    pub bump: u8,
}
