use anchor_lang::prelude::*;

use crate::{
    types::TokenFee,
    utils::{add, mul, sub},
};

#[account]
pub struct Proposal {
    pub intent: Pubkey,
    pub proposal_creator: Pubkey,
    pub deadline: u64,
    pub is_final: bool,
    pub is_signed: bool,
    pub instructions: Vec<ProposalInstruction>,
    pub fees: Vec<TokenFee>,
    pub bump: u8,
}

impl Proposal {
    /// Doesn't take into account size of variable fields
    pub const BASE_LEN: usize =
        32 + // intent
        32 + // proposal_creator
        8 + // deadline
        1 + // is_final
        1 + // is_signed
        1 // bump
    ;

    pub fn total_size(instructions: &Vec<ProposalInstruction>, fees_len: usize) -> Result<usize> {
        let size = add(8, Proposal::BASE_LEN)?;
        let size = add(size, Proposal::instructions_size(instructions)?)?;
        let size = add(size, Proposal::fees_size(fees_len)?)?;
        Ok(size)
    }

    pub fn instructions_size(instructions: &Vec<ProposalInstruction>) -> Result<usize> {
        let sum = instructions
            .iter()
            .try_fold(0usize, |acc, ix| add(acc, ix.size()))?;
        add(4, sum)
    }

    pub fn fees_size(len: usize) -> Result<usize> {
        add(4, mul(TokenFee::INIT_SPACE, len)?)
    }

    pub fn extended_size(
        size: usize,
        more_instructions: &Vec<ProposalInstruction>,
    ) -> Result<usize> {
        sub(
            add(size, Proposal::instructions_size(more_instructions)?)?,
            4,
        )
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalInstruction {
    pub program_id: Pubkey,
    pub accounts: Vec<ProposalInstructionAccountMeta>,
    pub data: Vec<u8>,
}

impl ProposalInstruction {
    pub fn size(&self) -> usize {
        let accounts_size = 4 + self.accounts.len() * (32 + 1 + 1);
        let data_size = 4 + self.data.len();

        32 + accounts_size + data_size
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalInstructionAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
