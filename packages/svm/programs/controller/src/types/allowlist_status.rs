use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum AllowlistStatus {
    Allowed = 1,
    Disallowed = 2,
}

impl anchor_lang::Space for AllowlistStatus {
    const INIT_SPACE: usize = 1;
}
