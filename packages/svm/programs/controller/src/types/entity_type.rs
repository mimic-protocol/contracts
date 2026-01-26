use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum EntityType {
    Validator = 0,
    Axia = 1,
    Solver = 2,
}

impl anchor_lang::Space for EntityType {
    const INIT_SPACE: usize = 1;
}
