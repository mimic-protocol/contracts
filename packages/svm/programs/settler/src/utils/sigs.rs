use anchor_lang::prelude::{instruction::Instruction, *};

use crate::errors::SettlerError;

pub fn check_ed25519_ix(ix: &Instruction) -> Result<()> {
    if ix.program_id.to_string() != "Ed25519SigVerify111111111111111111111111111"
        || ix.accounts.len() != 0
    {
        return err!(SettlerError::SigVerificationFailed);
    }

    Ok(())
}

pub struct Ed25519Args<'a> {
    pub pubkey: &'a [u8; 32],
    pub sig: &'a [u8; 64],
    pub msg: &'a [u8],
}

pub fn get_args_from_ed25519_ix_data(data: &[u8]) -> Result<Ed25519Args<'_>> {
    if data.len() < 112 {
        return err!(SettlerError::SigVerificationFailed);
    }

    let pubkey = data[16..16 + 32]
        .try_into()
        .map_err(|_| SettlerError::SigVerificationFailed)?;
    let sig = data[48..48 + 64]
        .try_into()
        .map_err(|_| SettlerError::SigVerificationFailed)?;
    let msg = &data[112..];

    Ok(Ed25519Args { pubkey, sig, msg })
}
