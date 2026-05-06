use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OperationEvent {
    pub topic: [u8; 32],
    pub data: Vec<u8>,
}

impl OperationEvent {
    pub fn size(&self) -> usize {
        32 + 4 + self.data.len()
    }
}
