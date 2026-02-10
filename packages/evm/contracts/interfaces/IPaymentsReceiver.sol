// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title PaymentsReceiver interface
 */
interface IPaymentsReceiver {
    /**
     * @dev The token address is zero
     */
    error PaymentsReceiverTokenZero();

    /**
     * @dev The recipient address is zero
     */
    error PaymentsReceiverRecipientZero();

    /**
     * @dev The amount is zero
     */
    error PaymentsReceiverAmountZero();

    /**
     * @dev The user address is zero
     */
    error PaymentsReceiverUserZero();

    /**
     * @dev The input arrays are not of equal length
     */
    error PaymentsReceiverInputInvalidLength();

    /**
     * @dev The token is not allowed
     */
    error PaymentsReceiverTokenNotAllowed(address token);

    /**
     * @dev Emitted every time a deposit is made
     */
    event Deposited(address indexed token, address indexed depositor, address indexed user, uint256 amount);

    /**
     * @dev Emitted every time a withdrawal is made
     */
    event Withdrawn(address indexed token, address indexed recipient, uint256 amount);

    /**
     * @dev Emitted every time a token permission is set
     */
    event TokenAllowedSet(address indexed token, bool allowed);

    /**
     * @dev Tells whether a token is allowed
     * @param token Address of the token being queried
     */
    function isTokenAllowed(address token) external view returns (bool);

    /**
     * @dev Sets permissions for multiple tokens
     * @param tokens List of token addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedTokens(address[] memory tokens, bool[] memory alloweds) external;

    /**
     * @dev Deposits ERC20 tokens into the contract
     * @param token Address of the token to deposit
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external;

    /**
     * @dev Deposits ERC20 tokens on behalf of a user
     * @param token Address of the token to deposit
     * @param user Address to attribute the deposit to
     * @param amount Amount to deposit
     */
    function depositOnBehalf(address token, address user, uint256 amount) external;

    /**
     * @dev Withdraws ERC20 tokens to a recipient
     * @param token Address of the token to withdraw
     * @param recipient Address of the recipient
     * @param amount Amount to withdraw
     */
    function withdraw(address token, address recipient, uint256 amount) external;
}
