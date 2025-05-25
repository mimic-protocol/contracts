// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * @title SmartAccount interface
 */
interface ISmartAccount is IERC165 {
    /**
     * @dev The sender is not the owner or the settler
     */
    error SmartAccountUnauthorizedSender(address sender);

    /**
     * @dev The settler is zero
     */
    error SmartAccountSettlerZero();

    /**
     * @dev The input arrays are not of equal length
     */
    error SmartAccountInputInvalidLength();

    /**
     * @dev Emitted every time tokens are transferred
     */
    event Transferred(address indexed token, address indexed recipient, uint256 amount);

    /**
     * @dev Emitted every time `call` is called
     */
    event Called(address indexed target, bytes data, uint256 value, bytes result);

    /**
     * @dev Emitted every time the settler is set
     */
    event SettlerSet(address indexed settler);

    /**
     * @dev Emitted every time a permission is set
     */
    event PermissionSet(address indexed account, address permission);

    /**
     * @dev Tells the reference to the Mimic settler
     */
    function settler() external view returns (address);

    /**
     * @dev Tells whether an account is allowed. Intended to be used by the Mimic registry to verify if
     * an account is permitted to perform certain actions.
     * @param account Address of the account being queried
     * @param data Data representing the specific action to be validated, only used for oracles
     */
    function hasPermission(address account, bytes memory data) external view returns (bool);

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

    /**
     * @dev Sets the settler
     * @param newSettler Address of the new settler to be set
     */
    function setSettler(address newSettler) external;

    /**
     * @dev Sets permissions for multiple accounts
     * @param accounts List of account addresses
     * @param permissions List of permission addresses
     */
    function setPermissions(address[] memory accounts, address[] memory permissions) external;
}
