use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct IntentEvent {
    pub topic: [u8; 32],
    pub data: Vec<u8>,
}

impl IntentEvent {
    pub fn size(&self) -> usize {
        32 + 4 + self.data.len()
    }
}
