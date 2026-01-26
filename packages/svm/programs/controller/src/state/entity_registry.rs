use anchor_lang::prelude::*;

use crate::types::EntityType;

#[account]
#[derive(InitSpace)]
pub struct EntityRegistry {
    pub entity_type: EntityType,
    #[max_len(32)]
    pub entity_address: Vec<u8>,
    pub bump: u8,
}

impl EntityRegistry {
    pub fn size(entity_address: &Vec<u8>) -> usize {
        1 + entity_address.len() + 1
    }
}
