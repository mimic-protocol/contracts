// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title Permission oracle interface
 */
interface IPermissionOracle {
    /**
     * @dev Tells whether an account is allowed
     * @param account Address of the account being queried
     * @param data Data representing the specific action to be validated
     */
    function hasPermission(address account, bytes memory data) external view returns (bool);
}
