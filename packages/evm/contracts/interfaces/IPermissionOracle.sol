// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title Permission oracle interface
 */
interface IPermissionOracle {
    /**
     * @dev Tells whether an account is allowed
     * @param account Address of the account being queried
     * @param config Data representing the specific permission configuration
     */
    function hasPermission(address account, bytes memory config) external view returns (bool);
}
