use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MaxFee {
    pub mint: Pubkey,
    pub amount: u64,
}

impl Space for MaxFee {
    const INIT_SPACE: usize = 32 + 8;
}
