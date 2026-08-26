// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @dev Mock of a smart account implementing ERC-1271. Each mode reproduces one of the responses a real
 * account may give, including the malformed ones a caller must treat as an invalid signature.
 */
contract ERC1271Mock {
    // EIP1271 magic return value
    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    // EIP1271 invalid signature return value
    bytes4 internal constant EIP1271_INVALID_SIGNATURE = 0xffffffff;

    enum Mode {
        AcceptsSignature,
        RejectsSignature,
        Reverts,
        ReturnsShortData,
        ReturnsNothing,
        AcceptsApprovedHashOnly
    }

    // Response the mock gives when its signature is verified
    Mode public mode;

    // Hashes approved on-chain, mimicking how Safe tracks messages signed by the account itself
    mapping (bytes32 => bool) public isHashApproved;

    /**
     * @dev The mock was configured to revert when verifying a signature
     */
    error ERC1271MockReverted();

    /**
     * @dev Creates a new ERC1271Mock contract
     * @param _mode Response the mock will give when its signature is verified
     */
    constructor(Mode _mode) {
        mode = _mode;
    }

    /**
     * @dev Approves a hash on-chain so it can be verified with an empty signature
     * @param hash Hash to be approved
     */
    function approveHash(bytes32 hash) external {
        isHashApproved[hash] = true;
    }

    /**
     * @dev Tells whether a signature is valid for a hash following the configured mode
     * @param hash Hash that was signed
     * @param signature Signature to be verified
     */
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        if (mode == Mode.Reverts) revert ERC1271MockReverted();

        if (mode == Mode.ReturnsNothing) {
            assembly {
                return(0, 0)
            }
        }

        if (mode == Mode.ReturnsShortData) {
            assembly {
                mstore(0, 0x1626ba7e00000000000000000000000000000000000000000000000000000000)
                return(0, 4)
            }
        }

        if (mode == Mode.AcceptsApprovedHashOnly) {
            bool approved = signature.length == 0 && isHashApproved[hash];
            return approved ? EIP1271_MAGIC_VALUE : EIP1271_INVALID_SIGNATURE;
        }

        return mode == Mode.AcceptsSignature ? EIP1271_MAGIC_VALUE : EIP1271_INVALID_SIGNATURE;
    }
}
