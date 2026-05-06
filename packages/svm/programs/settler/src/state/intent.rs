use anchor_lang::prelude::*;

use crate::{
    constants::DISCRIMINATOR_LEN, types::{Operation, TokenFee}, utils::{add, mul, sub}
};

#[account]
pub struct Intent {
    pub fee_payer: Pubkey,
    pub creator: Pubkey,
    pub hash: [u8; 32],
    pub nonce: [u8; 32],
    pub deadline: u64,
    pub min_validations: u16,
    pub is_final: bool,
    pub validators: Vec<[u8; 20]>, // TODO: how to store more efficiently?
    pub max_fees: Vec<TokenFee>,
    pub operations: Vec<Operation>,
    pub bump: u8,
}

impl Intent {
    /// Doesn't take into account size of variable fields
    pub const BASE_LEN: usize =
        32 + // fee_payer
        32 + // creator
        32 + // hash
        32 + // nonce
        8 + // deadline
        2 + // min_validations
        1 + // is_final
        1 // bump
    ;

    pub const VALIDATOR_ADDRESS_SIZE: usize = 20;

    pub fn total_size(
        max_fees_len: usize,
        operations: &Vec<Operation>,
        min_validations: u16,
    ) -> Result<usize> {
        let size = add(DISCRIMINATOR_LEN, Intent::BASE_LEN)?;
        let size = add(size, Intent::validators_size(min_validations)?)?;
        let size = add(size, Intent::max_fees_size(max_fees_len)?)?;
        let size = add(size, Intent::operations_size(operations)?)?;
        Ok(size)
    }

    pub fn validators_size(min_validations: u16) -> Result<usize> {
        add(
            4,
            mul(min_validations as usize, Self::VALIDATOR_ADDRESS_SIZE)?,
        )
    }

    pub fn max_fees_size(len: usize) -> Result<usize> {
        add(4, mul(TokenFee::INIT_SPACE, len)?)
    }

    pub fn operations_size(operations: &Vec<Operation>) -> Result<usize> {
        add(
            4,
            operations
                .iter()
                .try_fold(0usize, |acc, op| add(acc, op.total_size()?))?
        )
    }

    pub fn extended_size(
        size: usize,
        more_max_fees: &Option<Vec<TokenFee>>,
        more_operations: &Option<Vec<Operation>>,
    ) -> Result<usize> {
        let mut size = size;

        if let Some(v) = more_max_fees {
            size = add(size, sub(Intent::max_fees_size(v.len())?, 4)?)?;
        }

        if let Some(v) = more_operations {
            size = add(size, Intent::operations_size(v)?)?;
        }

        Ok(size)
    }
}
