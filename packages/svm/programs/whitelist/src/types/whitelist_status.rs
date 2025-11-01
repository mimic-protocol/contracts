use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum WhitelistStatus {
    Whitelisted = 1,
    Blacklisted = 2,
}

impl anchor_lang::Space for WhitelistStatus {
    const INIT_SPACE: usize = 1;
}
