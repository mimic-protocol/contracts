use anchor_lang::prelude::*;

use crate::{
    constants::{DISCRIMINATOR_LEN, VEC_SIZE_LEN},
    utils::{add, mul, sub, Proposal as Eip712Proposal},
};

#[account]
pub struct Proposal {
    pub intent: Pubkey,
    pub creator: Pubkey,
    pub deadline: u64,
    pub is_final: bool,
    pub is_signed: bool,
    pub instructions: Vec<ProposalInstruction>,
    pub fees: Vec<u64>,
    pub bump: u8,
}

impl Proposal {
    /// Doesn't take into account size of variable fields
    pub const BASE_LEN: usize =
        32 + // intent
        32 + // creator
        8 + // deadline
        1 + // is_final
        1 + // is_signed
        1 // bump
    ;

    pub fn total_size(instructions: &[ProposalInstruction], fees_len: usize) -> Result<usize> {
        let size = add(DISCRIMINATOR_LEN, Proposal::BASE_LEN)?;
        let size = add(size, Proposal::instructions_size(instructions)?)?;
        let size = add(size, Proposal::fees_size(fees_len)?)?;
        Ok(size)
    }

    pub fn instructions_size(instructions: &[ProposalInstruction]) -> Result<usize> {
        let sum = instructions
            .iter()
            .try_fold(0usize, |acc, ix| add(acc, ix.size()))?;
        add(VEC_SIZE_LEN, sum)
    }

    pub fn fees_size(len: usize) -> Result<usize> {
        add(VEC_SIZE_LEN, mul(8, len)?)
    }

    pub fn extended_size(size: usize, more_instructions: &[ProposalInstruction]) -> Result<usize> {
        sub(
            add(size, Proposal::instructions_size(more_instructions)?)?,
            VEC_SIZE_LEN,
        )
    }

    pub fn to_eip712_struct(&self, intent_hash: [u8; 32]) -> Eip712Proposal {
        use alloy_primitives::U256;

        Eip712Proposal {
            intent: intent_hash.into(),
            solver: self.creator.to_string(),
            deadline: U256::from(self.deadline),
            datas: vec![vec![].into()],
            fees: self.fees.iter().map(|&fee| U256::from(fee)).collect(),
        }
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
        let accounts_size = VEC_SIZE_LEN + self.accounts.len() * (32 + 1 + 1);
        let data_size = VEC_SIZE_LEN + self.data.len();

        32 + accounts_size + data_size
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalInstructionAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
