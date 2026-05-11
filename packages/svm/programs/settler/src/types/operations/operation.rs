use anchor_lang::prelude::*;

use crate::{
    constants::VEC_SIZE_LEN, types::{OpType, OperationEvent}, utils::add
};

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct Operation {
    pub op_type: OpType,
    pub user: Pubkey,
    pub data: Vec<u8>,
    pub events: Vec<OperationEvent>,
}

impl Operation {
    pub const BASE_LEN: usize = 1 + 32;

    pub fn total_size(&self) -> Result<usize> {
        let size = Operation::BASE_LEN;
        let size = add(size, self.data_size()?)?;
        let size = add(size, self.events_size()?)?;
        Ok(size)
    }

    pub fn data_size(&self) -> Result<usize> {
        add(VEC_SIZE_LEN, self.data.len())
    }

    pub fn events_size(&self) -> Result<usize> {
        let sum = self
            .events
            .iter()
            .try_fold(0usize, |acc, e| add(acc, e.size()))?;
        add(VEC_SIZE_LEN, sum)
    }
}
