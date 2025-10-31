use anchor_lang::prelude::Pubkey;

pub struct MaxFee {
    pub mint: Pubkey,
    pub amount: u64,
}
