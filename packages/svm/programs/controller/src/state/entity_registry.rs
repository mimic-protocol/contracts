use anchor_lang::prelude::*;

use crate::types::{AllowlistStatus, EntityType};

#[account]
#[derive(InitSpace)]
pub struct EntityRegistry {
    pub entity_type: EntityType,
    pub entity_pubkey: Pubkey,
    pub status: AllowlistStatus,
    pub bump: u8,
}
