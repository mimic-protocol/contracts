use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SettlerSettings {
    pub whitelist_program: Pubkey,
    pub is_paused: bool,
    pub bump: u8,
}
