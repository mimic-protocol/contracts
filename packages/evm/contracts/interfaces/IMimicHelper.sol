// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title Helper interface
 */
interface IMimicHelper {
    /**
     * @dev Tells the native token balance of an address
     * @param target Address to get native token balance
     */
    function getNativeTokenBalance(address target) external view returns (uint256);
}
