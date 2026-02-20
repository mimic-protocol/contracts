use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SettlerSettings {
    pub controller_program: Pubkey,
    pub eip712_domain_hash: [u8; 32],
    pub bump: u8,
}
