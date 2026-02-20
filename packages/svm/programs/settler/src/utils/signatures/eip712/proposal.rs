use alloy_sol_types::{sol as solidity, SolStruct};

use crate::utils::{EIP712_PREFIX, EIP712_PREIMAGE_LEN};

solidity! {
    struct Proposal {
        bytes32 intent;
        string solver;
        uint256 deadline;
        bytes data;
        uint256[] fees;
    }
}

/// Constructs the typed struct EIP712 hash preimage for Proposal
pub fn create_axia_message(domain_hash: &[u8; 32], proposal: Proposal) -> Vec<u8> {
    let mut out = Vec::with_capacity(EIP712_PREIMAGE_LEN);
    out.extend_from_slice(EIP712_PREFIX);
    out.extend_from_slice(domain_hash);
    out.extend_from_slice(proposal.eip712_hash_struct().as_ref());

    out
}
