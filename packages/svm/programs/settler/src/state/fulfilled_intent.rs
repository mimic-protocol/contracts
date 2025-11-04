use anchor_lang::prelude::*;

#[account]
pub struct FulfilledIntent {
    pub fulfilled_at: u64,
}
