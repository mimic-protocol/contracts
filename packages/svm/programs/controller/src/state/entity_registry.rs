use anchor_lang::prelude::*;

use crate::types::EntityType;

#[account]
#[derive(InitSpace)]
pub struct EntityRegistry {
    pub entity_type: EntityType,
    pub entity_pubkey: Pubkey,
    pub bump: u8,
}
