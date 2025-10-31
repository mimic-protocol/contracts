use anchor_lang::prelude::Pubkey;

use crate::types::ProposalInstructionAccountMeta;

pub struct ProposalInstruction {
    pub program_id: Pubkey,
    pub accounts: Vec<ProposalInstructionAccountMeta>,
    pub data: Vec<u8>,
}
