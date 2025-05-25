// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * @title Partial SmartAccount interface
 * @dev Includes only transfer, call, and hasPermission
 */
interface IPartialSmartAccount {
    /**
     * @dev Tells whether an account is allowed. Intended to be used by the Mimic registry to verify if
     * an account is permitted to perform certain actions.
     * @param account Address of the account being queried
     * @param config Data representing the specific permission configuration
     */
    function hasPermission(address account, bytes memory config) external view returns (bool);

    /**
     * @dev Transfers ERC20 or native tokens to the recipient. Sender must be the owner or the settler.
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function transfer(address token, address recipient, uint256 amount) external;

    /**
     * @dev Executes an arbitrary call from the contract. Sender must be the owner or the settler.
     * @param target Address where the call will be sent
     * @param data Calldata to be sent to the target
     * @param value Native token value to send along with the call
     */
    function call(address target, bytes memory data, uint256 value) external returns (bytes memory result);
}
