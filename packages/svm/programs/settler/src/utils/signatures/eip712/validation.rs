use alloy_sol_types::{sol as solidity, SolStruct};

use crate::utils::{EIP712_PREFIX, EIP712_PREIMAGE_LEN};

solidity! {
    struct Validation {
        bytes32 intent;
    }
}

/// Constructs the typed struct EIP712 hash preimage for Validation
pub fn create_validator_message(domain_hash: &[u8; 32], intent_hash: &[u8; 32]) -> Vec<u8> {
    let validation = Validation {
        intent: intent_hash.into(),
    };

    let mut out = Vec::with_capacity(EIP712_PREIMAGE_LEN);
    out.extend_from_slice(EIP712_PREFIX);
    out.extend_from_slice(domain_hash);
    out.extend_from_slice(validation.eip712_hash_struct().as_ref());

    out
}
