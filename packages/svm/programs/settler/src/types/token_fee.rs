use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TokenFee {
    pub token: Pubkey,
    pub amount: u64,
}

impl Space for TokenFee {
    const INIT_SPACE: usize = 32 + 8;
}
