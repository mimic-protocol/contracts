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
 * @param safeguards Indices into `SafeguardTree.leaves`
 * @param children Indices into `SafeguardTree.groups`
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
