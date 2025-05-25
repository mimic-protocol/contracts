// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';

/**
 * @title Settler interface
 */
interface ISettler {
    /**
     * @dev The requested intent type is unknown
     */
    error SettlerUnknownIntentType(uint8 op);

    /**
     * @dev The simulation has been successful
     */
    error SettlerSimulationSuccess(uint256 gasUsed);

    /**
     * @dev The solver is not allowed
     */
    error SettlerSolverNotAllowed(address solver);

    /**
     * @dev The executor is not allowed
     */
    error SettlerExecutorNotAllowed(address executor);

    /**
     * @dev The proposal signer is not allowed
     */
    error SettlerProposalSignerNotAllowed(address signer);

    /**
     * @dev The settler is not the current contract
     */
    error SettlerInvalidSettler(address settler);

    /**
     * @dev The nonce is zero
     */
    error SettlerNonceZero();

    /**
     * @dev The nonce has already been used for the user
     */
    error SettlerNonceAlreadyUsed(address user, bytes32 nonce);

    /**
     * @dev The intent deadline is in the past
     */
    error SettlerIntentPastDeadline(uint256 deadline, uint256 timestamp);

    /**
     * @dev The current chain is not valid
     */
    error SettlerInvalidChain(uint256 chainId);

    /**
     * @dev The recipient is the settler contract
     */
    error SettlerInvalidRecipient(address to);

    /**
     * @dev The user is not a smart account
     */
    error SettlerUserNotSmartAccount(address user);

    /**
     * @dev The amount out is lower than the proposed amount
     */
    error SettlerAmountOutLtProposed(uint256 index, uint256 amountOut, uint256 proposed);

    /**
     * @dev The proposed amount is lower than the minimum amount
     */
    error SettlerProposedAmountLtMinAmount(uint256 index, uint256 proposed, uint256 minAmount);

    /**
     * @dev The proposed amounts array and the tokens out array are not of equal length
     */
    error SettlerInvalidProposedAmounts();

    /**
     * @dev The balance after the proposal execution is lower than the balance before
     */
    error SettlerPostBalanceOutLtPre(uint256 index, uint256 post, uint256 pre);

    /**
     * @dev The solver fee is too high
     */
    error SettlerSolverFeeTooHigh(uint256 requested, uint256 proposed);

    /**
     * @dev The proposal deadline is in the past
     */
    error SettlerProposalPastDeadline(uint256 deadline, uint256 timestamp);

    /**
     * @dev The rescue funds recipient is zero
     */
    error SettlerRescueFundsRecipientZero();

    /**
     * @dev Emitted every time an intent is fulfilled
     */
    event Executed(bytes32 indexed proposal);

    /**
     * @dev Emitted every time tokens are withdrawn from the contract balance
     */
    event FundsRescued(address indexed token, address indexed recipient, uint256 amount);

    /**
     * @dev Tells the reference to the Mimic controller
     */
    function controller() external view returns (address);

    /**
     * @dev Tells whether a nonce has been used by a user
     * @param user Address of the user being queried
     * @param nonce Nonce being queried
     */
    function isNonceUsed(address user, bytes32 nonce) external view returns (bool);

    /**
     * @dev Tells the hash of an intent
     * @param intent Intent to get the hash of
     */
    function getIntentHash(Intent memory intent) external pure returns (bytes32);

    /**
     * @dev Tells the hash of a proposal
     * @param proposal Proposal to be hashed
     * @param intent Intent being fulfilled by the requested proposal
     * @param solver Address of the solver that made the proposal
     */
    function getProposalHash(Proposal memory proposal, Intent memory intent, address solver)
        external
        pure
        returns (bytes32);

    /**
     * @dev Withdraws ERC20 or native tokens from the contract
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function rescueFunds(address token, address recipient, uint256 amount) external;

    /**
     * @dev Executes a proposal to fulfill an intent
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     */
    function execute(Intent memory intent, Proposal memory proposal, bytes memory signature) external;

    /**
     * @dev Simulates an execution. It will always revert. Successful executions are returned as
     * `SettlerSimulationSuccess` errors. Any other error should be treated as failure.
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     */
    function simulate(Intent memory intent, Proposal memory proposal, bytes memory signature) external;
}
