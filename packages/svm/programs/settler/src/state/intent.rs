use anchor_lang::prelude::*;

use crate::types::{IntentEvent, MaxFee, OpType};

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
    // max 10
    pub validators: Vec<[u8; 32]>, // TODO: how to store more efficiently? how to know max beforehand? is min enough?
    pub is_final: bool,
    pub intent_data: Vec<u8>,
    pub max_fees: Vec<MaxFee>,
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
        4 + 32 * 10 + // validators // TODO: rethink
        1 + // is_final
        1 // bump
    ;

    pub fn data_size(len: usize) -> usize {
        4 + len
    }

    pub fn max_fees_size(len: usize) -> usize {
        4 + MaxFee::INIT_SPACE * len
    }

    pub fn events_size(events: &Vec<IntentEvent>) -> usize {
        4 + events.iter().map(|event| event.size()).sum::<usize>()
    }

    pub fn extended_size(
        mut size: usize,
        more_data: &Option<Vec<u8>>,
        more_max_fees: &Option<Vec<MaxFee>>,
        more_events: &Option<Vec<IntentEvent>>,
    ) -> usize {
        if let Some(_more_data) = more_data {
            size += Intent::data_size(_more_data.len()) - 4;
        }

        if let Some(_more_max_fees) = more_max_fees {
            size += Intent::max_fees_size(_more_max_fees.len()) - 4;
        }

        if let Some(_more_events) = more_events {
            size += Intent::events_size(&_more_events) - 4;
        }

        size
    }
}
