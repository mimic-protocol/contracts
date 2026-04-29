use anchor_lang::prelude::*;

use crate::{constants::VEC_LEN_SIZE, types::EntityType};

#[account]
pub struct EntityRegistry {
    pub entity_type: EntityType,
    pub entity_address: Vec<u8>,
    pub bump: u8,
}

impl EntityRegistry {
    pub fn size(entity_address: &[u8]) -> usize {
        EntityType::INIT_SPACE + VEC_LEN_SIZE + entity_address.len() + 1
    }
}
