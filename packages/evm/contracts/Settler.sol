// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

import './Intents.sol';
import './interfaces/IController.sol';
import './interfaces/ISettler.sol';
import './utils/ERC20Helpers.sol';

/**
 * @title Settler
 * @dev Contract that provides the appropriate context for solvers to execute proposals that fulfill user intents
 */
contract Settler is ISettler, Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using IntentsHelpers for Intent;
    using IntentsHelpers for Proposal;

    // Mimic controller reference
    // solhint-disable-next-line immutable-vars-naming
    address public immutable override controller;

    // List of already used nonces by user
    mapping (address => mapping (bytes32 => bool)) public override isNonceUsed;

    /**
     * @dev Modifier to tag settler functions in order to check if the sender is an allowed solver
     */
    modifier onlySolver() {
        address sender = _msgSender();
        if (!IController(controller).isSolverAllowed(sender)) revert SettlerSolverNotAllowed(sender);
        _;
    }

    /**
     * @dev Creates a new Settler contract
     * @param _controller Address of the Settler controller
     * @param _owner Address that will own the contract
     */
    constructor(address _controller, address _owner) Ownable(_owner) EIP712('Mimic Protocol Settler', '1') {
        controller = _controller;
    }

    /**
     * @dev Tells the hash of an intent
     * @param intent Intent to get the hash of
     */
    function getIntentHash(Intent memory intent) external pure override returns (bytes32) {
        return intent.hash();
    }

    /**
     * @dev Tells the hash of a proposal
     * @param proposal Proposal to be hashed
     * @param intent Intent being fulfilled by the requested proposal
     * @param solver Address of the solver that made the proposal
     */
    function getProposalHash(Proposal memory proposal, Intent memory intent, address solver)
        external
        pure
        override
        returns (bytes32)
    {
        return proposal.hash(intent, solver);
    }

    /**
     * @dev It allows receiving native token transfers
     * Note: This method mainly allow supporting native tokes for swaps
     */
    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Withdraws ERC20 or native tokens from the contract
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function rescueFunds(address token, address recipient, uint256 amount) external override onlyOwner nonReentrant {
        if (recipient == address(0)) revert SettlerRescueFundsRecipientZero();
        ERC20Helpers.transfer(token, recipient, amount);
        emit FundsRescued(token, recipient, amount);
    }

    /**
     * @dev Executes a proposal to fulfill an intent
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     */
    function execute(Intent memory intent, Proposal memory proposal, bytes memory signature)
        external
        override
        onlySolver
    {
        _execute(intent, proposal, signature, false);
    }

    /**
     * @dev Simulates an execution. It will always revert. Successful executions are returned as
     * `SettlerSimulationSuccess` errors. Any other error should be treated as failure.
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     */
    function simulate(Intent memory intent, Proposal memory proposal, bytes memory signature)
        external
        override
        onlySolver
    {
        uint256 initialGas = gasleft();
        _execute(intent, proposal, signature, true);
        uint256 gasUsed = initialGas - gasleft();
        revert SettlerSimulationSuccess(gasUsed);
    }

    /**
     * @dev Validates and executes a proposal to fulfill an intent
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     * @param simulated Whether the execution is a simulation
     */
    function _execute(Intent memory intent, Proposal memory proposal, bytes memory signature, bool simulated)
        internal
        nonReentrant
    {
        _validateIntent(intent, proposal, signature, simulated);
        isNonceUsed[intent.user][intent.nonce] = true;

        if (intent.op == OpType.Swap) _executeSwap(intent, proposal);
        else if (intent.op == OpType.Transfer) _executeTransfer(intent, proposal);
        else if (intent.op == OpType.Call) _executeCall(intent, proposal);
        else revert SettlerUnknownIntentType(uint8(intent.op));

        emit Executed(proposal.hash(intent, _msgSender()));
    }

    /**
     * @dev Validates and executes a proposal to fulfill a swap intent
     * @param intent Swap intent to be fulfilled
     * @param proposal Swap proposal to be executed
     */
    function _executeSwap(Intent memory intent, Proposal memory proposal) internal {
        SwapIntent memory swapIntent = abi.decode(intent.data, (SwapIntent));
        SwapProposal memory swapProposal = abi.decode(proposal.data, (SwapProposal));
        _validateSwapIntent(swapIntent, swapProposal);

        if (swapIntent.sourceChain == block.chainid) {
            for (uint256 i = 0; i < swapIntent.tokensIn.length; i++) {
                IERC20 tokenIn = IERC20(swapIntent.tokensIn[i].token);
                uint256 amountIn = swapIntent.tokensIn[i].amount;
                // TODO: contemplate smart accounts
                tokenIn.safeTransferFrom(intent.user, address(swapProposal.executor), amountIn);
            }
        }

        uint256[] memory preBalancesOut = _getTokensOutBalance(swapIntent);
        Address.functionCall(swapProposal.executor, swapProposal.data);

        if (swapIntent.destinationChain == block.chainid) {
            for (uint256 i = 0; i < swapIntent.tokensOut.length; i++) {
                TokenOut memory tokenOut = swapIntent.tokensOut[i];
                uint256 postBalanceOut = ERC20Helpers.balanceOf(tokenOut.token, address(this));
                uint256 preBalanceOut = preBalancesOut[i];
                if (postBalanceOut < preBalanceOut) revert SettlerPostBalanceOutLtPre(i, postBalanceOut, preBalanceOut);

                uint256 amountOut = postBalanceOut - preBalanceOut;
                uint256 proposedAmount = swapProposal.amountsOut[i];
                if (amountOut < proposedAmount) revert SettlerAmountOutLtProposed(i, amountOut, proposedAmount);

                ERC20Helpers.transfer(tokenOut.token, tokenOut.recipient, amountOut);
            }
        }
    }

    /**
     * @dev Validates and executes a proposal to fulfill a transfer intent
     * @param intent Transfer intent to be fulfilled
     * @param proposal Transfer proposal to be executed
     */
    function _executeTransfer(Intent memory intent, Proposal memory proposal) internal {
        TransferIntent memory transferIntent = abi.decode(intent.data, (TransferIntent));
        TransferProposal memory transferProposal = abi.decode(proposal.data, (TransferProposal));
        _validateTransferIntent(transferIntent, transferProposal);

        for (uint256 i = 0; i < transferIntent.transfers.length; i++) {
            TransferData memory transfer = transferIntent.transfers[i];
            // TODO: contemplate smart accounts (handle native too)
            IERC20(transfer.token).safeTransferFrom(intent.user, transfer.recipient, transfer.amount);
        }

        // TODO: contemplate smart accounts (handle native too)
        IERC20(transferIntent.feeToken).safeTransferFrom(intent.user, _msgSender(), transferProposal.feeAmount);
    }

    /**
     * @dev Validates and executes a proposal to fulfill a call intent
     * @param intent Call intent to be fulfilled
     * @param proposal Call proposal to be executed
     */
    function _executeCall(Intent memory intent, Proposal memory proposal) internal {
        CallIntent memory callIntent = abi.decode(intent.data, (CallIntent));
        CallProposal memory callProposal = abi.decode(proposal.data, (CallProposal));
        _validateCallIntent(callIntent, callProposal);
        // TODO: implement
    }

    /**
     * @dev Validates an intent and its corresponding proposal
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     * @param signature Proposal signature
     * @param simulated Whether the execution is a simulation
     */
    function _validateIntent(Intent memory intent, Proposal memory proposal, bytes memory signature, bool simulated)
        internal
        view
    {
        if (intent.settler != address(this)) revert SettlerInvalidSettler(intent.settler);
        if (intent.nonce == bytes32(0)) revert SettlerNonceZero();
        if (isNonceUsed[intent.user][intent.nonce]) revert SettlerNonceAlreadyUsed(intent.user, intent.nonce);
        if (intent.deadline <= block.timestamp) revert SettlerIntentPastDeadline(intent.deadline, block.timestamp);

        bool isProposalPastDeadline = proposal.deadline <= block.timestamp;
        if (isProposalPastDeadline) revert SettlerProposalPastDeadline(proposal.deadline, block.timestamp);

        // TODO: fix signature check
        address signer = ECDSA.recover(_hashTypedDataV4(proposal.hash(intent, _msgSender())), signature);
        bool isProposalSignerNotAllowed = !IController(controller).isProposalSignerAllowed(signer) && !simulated;
        if (isProposalSignerNotAllowed) revert SettlerProposalSignerNotAllowed(signer);
    }

    /**
     * @dev Validates a swap intent and its corresponding proposal
     * @param intent Swap intent to be fulfilled
     * @param proposal Proposal to be executed
     */
    function _validateSwapIntent(SwapIntent memory intent, SwapProposal memory proposal) internal view {
        bool isChainInvalid = intent.sourceChain != block.chainid && intent.destinationChain != block.chainid;
        if (isChainInvalid) revert SettlerInvalidChain(intent.sourceChain, intent.destinationChain);

        if (proposal.amountsOut.length != intent.tokensOut.length) revert SettlerInvalidProposedAmounts();

        for (uint256 i = 0; i < intent.tokensOut.length; i++) {
            TokenOut memory tokenOut = intent.tokensOut[i];

            address recipient = tokenOut.recipient;
            if (recipient == address(this)) revert SettlerInvalidRecipient(recipient);

            uint256 minAmount = tokenOut.minAmount;
            uint256 proposedAmount = proposal.amountsOut[i];
            if (proposedAmount < minAmount) revert SettlerProposedAmountLtMinAmount(i, proposedAmount, minAmount);
        }

        if (intent.sourceChain != intent.destinationChain) {
            bool isExecutorInvalid = !IController(controller).isExecutorAllowed(proposal.executor);
            if (isExecutorInvalid) revert SettlerExecutorNotAllowed(proposal.executor);
        }
    }

    /**
     * @dev Validates a transfer intent and its corresponding proposal
     * @param intent Transfer intent to be fulfilled
     * @param proposal Proposal to be executed
     */
    function _validateTransferIntent(TransferIntent memory intent, TransferProposal memory proposal) internal view {
        for (uint256 i = 0; i < intent.transfers.length; i++) {
            address recipient = intent.transfers[i].recipient;
            if (recipient == address(this)) revert SettlerInvalidRecipient(recipient);
        }

        if (intent.feeAmount < proposal.feeAmount) revert SettlerSolverFeeTooHigh(intent.feeAmount, proposal.feeAmount);
    }

    /**
     * @dev Validates a call intent and its corresponding proposal
     * @param intent Call intent to be fulfilled
     * @param proposal Proposal to be executed
     */
    function _validateCallIntent(CallIntent memory intent, CallProposal memory proposal) internal view {
        // TODO: validate smart account
        if (intent.feeAmount < proposal.feeAmount) revert SettlerSolverFeeTooHigh(intent.feeAmount, proposal.feeAmount);
    }

    /**
     * @dev Tells the contract balance for each token out of a swap intent
     * @param intent Swap intent containing the list of tokens out
     */
    function _getTokensOutBalance(SwapIntent memory intent) internal view returns (uint256[] memory balances) {
        balances = new uint256[](intent.tokensOut.length);
        if (intent.destinationChain == block.chainid) {
            for (uint256 i = 0; i < intent.tokensOut.length; i++) {
                balances[i] = ERC20Helpers.balanceOf(intent.tokensOut[i].token, address(this));
            }
        }
    }
}
