use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum OpType {
    Swap = 0,
    Transfer = 1,
    Call = 2,
}
