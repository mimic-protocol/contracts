use anchor_lang::prelude::*;

use crate::types::{EntityType, WhitelistStatus};

#[account]
#[derive(InitSpace)]
pub struct EntityRegistry {
    pub entity_type: EntityType,
    pub entity_pubkey: Pubkey,
    pub status: WhitelistStatus,
    pub bump: u8,
}
