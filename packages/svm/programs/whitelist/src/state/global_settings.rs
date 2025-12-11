use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalSettings {
    pub admin: Pubkey,
    pub proposed_admin: Option<Pubkey>,
    pub proposed_admin_cooldown: u64,
    pub proposed_admin_next_change_timestamp: u64,
    pub bump: u8,
}
