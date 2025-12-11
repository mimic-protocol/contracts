use anchor_lang::prelude::*;

#[repr(u8)]
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum OpType {
    Swap = 1,
    Transfer = 2,
    Call = 3,
}
