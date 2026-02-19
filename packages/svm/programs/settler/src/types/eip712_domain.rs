use alloy_primitives::{FixedBytes, U256};
use alloy_sol_types::Eip712Domain as AlloyEip712Domain;
use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Eip712Domain {
    pub name: Option<String>,
    pub version: Option<String>,
    pub chain_id: Option<u64>,
    pub salt: Option<[u8; 32]>,
}

impl Eip712Domain {
    pub fn to_alloy_struct(&self) -> AlloyEip712Domain {
        AlloyEip712Domain {
            name: self.name.clone().map(Into::into),
            version: self.version.clone().map(Into::into),
            chain_id: self.chain_id.map(|n| U256::from(n)),
            verifying_contract: None,
            salt: self.salt.map(|b| FixedBytes::from(b)),
        }
    }
}
