use anchor_lang::prelude::*;

use crate::{
    types::{IntentEvent, OpType, TokenFee},
    utils::{add, mul, sub},
};

#[account]
pub struct Intent {
    pub op: OpType,
    pub user: Pubkey,
    pub intent_creator: Pubkey,
    pub intent_hash: [u8; 32],
    pub nonce: [u8; 32],
    pub deadline: u64,
    pub min_validations: u16,
    pub validations: u16,
    pub is_final: bool,
    pub validators: Vec<Pubkey>, // TODO: how to store more efficiently?
    pub intent_data: Vec<u8>,
    pub max_fees: Vec<TokenFee>,
    pub events: Vec<IntentEvent>,
    pub bump: u8,
}

impl Intent {
    /// Doesn't take into account size of variable fields
    pub const BASE_LEN: usize =
        1 + // op
        32 + // user
        32 + // intent_creator
        32 + // intent_hash
        32 + // nonce
        8 + // deadline
        2 + // min_validations
        2 + // validations
        1 + // is_final
        1 // bump
    ;

    pub fn total_size(
        data_len: usize,
        max_fees_len: usize,
        events: &[IntentEvent],
        min_validations: u16,
    ) -> Result<usize> {
        let size = add(8, Intent::BASE_LEN)?;
        let size = add(size, Intent::data_size(data_len)?)?;
        let size = add(size, Intent::max_fees_size(max_fees_len)?)?;
        let size = add(size, Intent::events_size(events)?)?;
        let size = add(size, Intent::validators_size(min_validations)?)?;
        Ok(size)
    }

    pub fn data_size(len: usize) -> Result<usize> {
        add(4, len)
    }

    pub fn max_fees_size(len: usize) -> Result<usize> {
        add(4, mul(TokenFee::INIT_SPACE, len)?)
    }

    pub fn events_size(events: &[IntentEvent]) -> Result<usize> {
        let sum = events
            .iter()
            .try_fold(0usize, |acc, e| add(acc, e.size()))?;
        add(4, sum)
    }

    pub fn validators_size(min_validations: u16) -> Result<usize> {
        add(4, mul(min_validations as usize, 32)?)
    }

    pub fn extended_size(
        size: usize,
        more_data: &Option<Vec<u8>>,
        more_max_fees: &Option<Vec<TokenFee>>,
        more_events: &Option<Vec<IntentEvent>>,
    ) -> Result<usize> {
        let mut size = size;

        if let Some(v) = more_data {
            size = add(size, sub(Intent::data_size(v.len())?, 4)?)?;
        }

        if let Some(v) = more_max_fees {
            size = add(size, sub(Intent::max_fees_size(v.len())?, 4)?)?;
        }

        if let Some(v) = more_events {
            size = add(size, sub(Intent::events_size(v)?, 4)?)?;
        }

        Ok(size)
    }
}
