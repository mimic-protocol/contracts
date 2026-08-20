// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @dev Safeguard config modes
 * - List: Safeguard lists
 * - Tree: Safeguard groups
 */
enum SafeguardConfigMode {
    List,
    Tree
}

/**
 * @dev Logical operators for safeguard groups
 * - AND: every child must pass
 * - OR:  at least one child must pass
 * - XOR: exactly one child must pass
 * - NOT: every child must fail
 */
enum SafeguardGroupLogic {
    AND,
    OR,
    XOR,
    NOT
}

/**
 * @dev Flat node in the safeguard tree
 * @param logic Group operator (AND/OR/XOR/NOT)
 * @param leaves Indices into `SafeguardTree.leaves`
 * @param children Indices into `SafeguardTree.nodes`
 */
struct SafeguardGroup {
    uint8 logic;
    uint16[] leaves;
    uint16[] children;
}

/**
 * @dev Safeguard tree representation
 * @param nodes List of all the nodes in the tree
 * @param leaves List of all the leaves in the tree
 */
struct SafeguardTree {
    SafeguardGroup[] nodes;
    Safeguard[] leaves;
}

/**
 * @dev Safeguard representation
 * @param mode Safeguard mode
 * @param config Safeguard configuration settings or parameters
 */
struct Safeguard {
    uint8 mode;
    bytes config;
}

/**
 * @dev EIP-712 typed data struct representing a user's authorization to set its safeguard
 * @param user User the safeguard belongs to
 * @param safeguard Encoded safeguard config to be set for the user
 * @param nonce Unique value chosen by the user to prevent replay attacks
 * @param deadline Timestamp by which the safeguard must be set
 */
struct UserSafeguard {
    address user;
    bytes safeguard;
    uint256 nonce;
    uint256 deadline;
}

library SafeguardsHelpers {
    bytes32 internal constant USER_SAFEGUARD_TYPE_HASH =
        keccak256('UserSafeguard(address user,bytes safeguard,uint256 nonce,uint256 deadline)');

    function hash(UserSafeguard memory userSafeguard) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    USER_SAFEGUARD_TYPE_HASH,
                    userSafeguard.user,
                    keccak256(userSafeguard.safeguard),
                    userSafeguard.nonce,
                    userSafeguard.deadline
                )
            );
    }
}
