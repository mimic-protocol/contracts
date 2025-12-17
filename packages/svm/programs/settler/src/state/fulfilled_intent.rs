use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FulfilledIntent {
    pub fulfilled_at: u64,
}
