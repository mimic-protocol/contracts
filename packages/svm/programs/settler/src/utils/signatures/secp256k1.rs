use anchor_lang::prelude::{instruction::Instruction, *};

use crate::errors::SettlerError;

const SECP256K1_ID: Pubkey = pubkey!("KeccakSecp256k11111111111111111111111111111");

pub fn check_secp256k1_ix(ix: &Instruction) -> Result<()> {
    if ix.program_id != SECP256K1_ID || !ix.accounts.is_empty() {
        return err!(SettlerError::SigVerificationFailedInvalidPreinstruction);
    }

    Ok(())
}

pub struct Secp256k1Args<'a> {
    pub eth_address: &'a [u8; 20],
    pub sig: &'a [u8; 64],
    pub msg: &'a [u8],
}

const SIGNATURE_OFFSETS_SERIALIZED_SIZE: u16 = 11;
const DATA_START: u16 = 1 + SIGNATURE_OFFSETS_SERIALIZED_SIZE;

pub fn get_args_from_secp256k1_ix_data(data: &[u8]) -> Result<Secp256k1Args<'_>> {
    if data.len() < 97 {
        return err!(SettlerError::SigVerificationFailedInvalidPreinstruction);
    }

    // Header
    let num_signatures = &[data[0]];
    let signature_offset = &data[1..=2];
    let signature_instruction_index = &[data[3]];
    let eth_address_offset = &data[4..=5];
    let eth_address_instruction_index = &[data[6]];
    let message_data_offset = &data[7..=8];
    let message_data_size = &data[9..=10];
    let message_instruction_index = &[data[11]];

    // Data
    // Note: the recovery_id is not used in this stage, as this is already
    // handled by the Solana Secp256k1Program while recovering the address
    // from the signed message. Therefore, we ignore it here as we only care
    // about the address that signed and the message that was signed.
    let eth_address = &data[12..12 + 20];
    let sig = &data[32..32 + 64];
    let _recovery_id = data[96];
    let msg = &data[97..];

    // Expected values
    let msg_len: u16 = msg.len().try_into().unwrap();
    let eth_address_len: u16 = eth_address.len().try_into().unwrap();
    let sig_len: u16 = sig.len().try_into().unwrap();

    let exp_eth_address_offset: u16 = DATA_START;
    let exp_signature_offset: u16 = DATA_START + eth_address_len;
    let exp_message_data_offset: u16 = exp_signature_offset + sig_len + 1;
    let exp_num_signatures: u8 = 1;

    // Header check
    if num_signatures != &exp_num_signatures.to_le_bytes()
        || signature_offset != exp_signature_offset.to_le_bytes()
        || signature_instruction_index != &[0]
        || eth_address_offset != exp_eth_address_offset.to_le_bytes()
        || eth_address_instruction_index != &[0]
        || message_data_offset != exp_message_data_offset.to_le_bytes()
        || message_data_size != msg_len.to_le_bytes()
        || message_instruction_index != &[0]
    {
        return err!(SettlerError::SigVerificationFailedInvalidPreinstruction);
    }

    Ok(Secp256k1Args {
        eth_address: eth_address
            .try_into()
            .map_err(|_| SettlerError::SigVerificationFailedInvalidPreinstruction)?,
        msg,
        sig: sig
            .try_into()
            .map_err(|_| SettlerError::SigVerificationFailedInvalidPreinstruction)?,
    })
}
