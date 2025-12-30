use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum EntityType {
    Validator = 1,
    Axia = 2,
    Solver = 3,
}

impl anchor_lang::Space for EntityType {
    const INIT_SPACE: usize = 1;
}
