use anchor_lang::prelude::*;

#[account]
pub struct Proposal {
    pub intent: Pubkey,
    pub solver: Pubkey,
    pub deadline: u64,
    pub is_final: bool,
    pub instructions: Vec<ProposalInstruction>,
    pub bump: u8,
}

impl Proposal {
    /// Doesn't take into account size of variable fields
    pub const BASE_LEN: usize =
        32 + // intent
        32 + // solver
        8 + // deadline
        1 + // is_final
        1 // bump
    ;
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalInstruction {
    pub program_id: Pubkey,
    pub accounts: Vec<ProposalInstructionAccountMeta>,
    pub data: Vec<u8>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProposalInstructionAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
