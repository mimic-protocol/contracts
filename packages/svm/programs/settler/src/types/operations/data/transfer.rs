use anchor_lang::prelude::{borsh::BorshDeserialize, *};

#[derive(BorshDeserialize)]
pub struct SvmTransfer {
    pub token: Vec<u8>,
    pub amount: u64,
    pub recipient: Vec<u8>,
}

#[derive(BorshDeserialize)]
pub struct SvmTransferIntentData {
    pub chain_id: u32,
    pub transfers: Vec<SvmTransfer>,
}
