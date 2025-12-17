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

    // Header
    let num_signatures = &[data[0]];
    let padding = &[data[1]];
    let signature_offset = &data[2..=3];
    let signature_instruction_index = &data[4..=5];
    let public_key_offset = &data[6..=7];
    let public_key_instruction_index = &data[8..=9];
    let message_data_offset = &data[10..=11];
    let message_data_size = &data[12..=13];
    let message_instruction_index = &data[14..=15];

    // Data
    let pubkey = &data[16..16 + 32];
    let sig = &data[48..48 + 64];
    let msg = &data[112..];

    // Expected values
    let exp_public_key_offset: u16 = 16; // 2*u8 + 7*u16
    let exp_signature_offset: u16 = exp_public_key_offset + 32_u16;
    let exp_message_data_offset: u16 = exp_signature_offset + 64_u16;
    let exp_num_signatures: u8 = 1;
    let exp_message_data_size: u16 = msg
        .len()
        .try_into()
        .map_err(|_| SettlerError::SigVerificationFailed)?;

    // Header
    if num_signatures != &exp_num_signatures.to_le_bytes()
        || padding != &[0]
        || signature_offset != &exp_signature_offset.to_le_bytes()
        || signature_instruction_index != &u16::MAX.to_le_bytes()
        || public_key_offset != &exp_public_key_offset.to_le_bytes()
        || public_key_instruction_index != &u16::MAX.to_le_bytes()
        || message_data_offset != &exp_message_data_offset.to_le_bytes()
        || message_data_size != &exp_message_data_size.to_le_bytes()
        || message_instruction_index != &u16::MAX.to_le_bytes()
    {
        return err!(SettlerError::SigVerificationFailed);
    }

    Ok(Ed25519Args {
        pubkey: pubkey
            .try_into()
            .map_err(|_| SettlerError::SigVerificationFailed)?,
        sig: sig
            .try_into()
            .map_err(|_| SettlerError::SigVerificationFailed)?,
        msg,
    })
}
