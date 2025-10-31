use anchor_lang::prelude::Pubkey;

pub struct ProposalInstructionAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
