// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @dev Safeguard representation
 * @param mode Safeguard mode
 * @param config Safeguard configuration settings or parameters
 */
struct Safeguard {
    uint8 mode;
    bytes config;
}
