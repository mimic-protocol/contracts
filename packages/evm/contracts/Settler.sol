// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

import './Intents.sol';
import './interfaces/IController.sol';
import './interfaces/IOperationsValidator.sol';
import './interfaces/IExecutor.sol';
import './interfaces/ISettler.sol';
import './utils/Denominations.sol';
import './utils/ERC20Helpers.sol';
import './smart-accounts/SmartAccountsHandler.sol';
import './smart-accounts/SmartAccountsHandlerHelpers.sol';

/**
 * @title Settler
 * @dev Contract that provides the appropriate context for solvers to execute proposals that fulfill user intents
 */
contract Settler is ISettler, Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using IntentsHelpers for Intent;
    using IntentsHelpers for Proposal;
    using IntentsHelpers for Operation;
    using IntentsHelpers for Validation;
    using SmartAccountsHandlerHelpers for address;

    // Mimic controller reference
    // solhint-disable-next-line immutable-vars-naming
    address public immutable override controller;

    // Smart accounts handler reference
    address public override smartAccountsHandler;

    // Operations validator reference
    address public override operationsValidator;

    // List of block numbers at which a user nonce was used
    mapping (address => mapping (bytes32 => uint256)) public override getNonceBlock;

    // Safeguard config per user
    mapping (address => bytes) internal _userSafeguard;

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
        smartAccountsHandler = address(new SmartAccountsHandler());
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
     * @dev Tells the safeguard set for a user
     * @param user Address of the user being queried
     */
    function getUserSafeguard(address user) external view override returns (bytes memory) {
        return _userSafeguard[user];
    }

    /**
     * @dev It allows receiving native token transfers
     * Note: This method mainly allows supporting native tokens for swaps
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
     * @dev Sets a new smart accounts handler
     * @param newSmartAccountsHandler New smart accounts handler to be set
     */
    function setSmartAccountsHandler(address newSmartAccountsHandler) external override onlyOwner {
        _setSmartAccountsHandler(newSmartAccountsHandler);
    }

    /**
     * @dev Sets a new operations validator address
     * @param newOperationsValidator New operations validator to be set
     */
    function setOperationsValidator(address newOperationsValidator) external override onlyOwner {
        _setOperationsValidator(newOperationsValidator);
    }

    /**
     * @dev Sets a safeguard for a user
     * @param safeguard Safeguard to be set
     */
    function setSafeguard(bytes memory safeguard) external override {
        _setSafeguard(msg.sender, safeguard);
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
        getNonceBlock[intent.feePayer][intent.nonce] = block.number;

        for (uint256 i = 0; i < intent.operations.length; i++) {
            Operation memory operation = intent.operations[i];
            if (operation.opType == uint8(OpType.Swap)) {
                bytes32 operationHash = operation.hash(intent.nonce, i);
                _executeSwap(operation, proposal, operationHash, i);
            } else if (operation.opType == uint8(OpType.Transfer)) _executeTransfer(operation, proposal, i);
            else if (operation.opType == uint8(OpType.Call)) _executeCall(operation, proposal, i);
            else revert SettlerUnknownOperationType(uint8(operation.opType));
        }
        _payFees(intent, proposal);
        emit ProposalExecuted(proposal.hash(intent, _msgSender()));
    }

    /**
     * @dev Validates and executes a proposal to fulfill a swap operation
     * @param operation Swap operation to be fulfilled
     * @param proposal Proposal with swap data to be executed
     * @param operationHash Unique hash of operation
     * @param index Position where the swap proposal data is located on datas
     */
    function _executeSwap(Operation memory operation, Proposal memory proposal, bytes32 operationHash, uint256 index)
        internal
    {
        SwapOperation memory swapOperation = abi.decode(operation.data, (SwapOperation));
        SwapProposal memory swapProposal = abi.decode(proposal.datas[index], (SwapProposal));
        _validateSwapOperation(swapOperation, swapProposal);

        bool isSmartAccount = smartAccountsHandler.isSmartAccount(operation.user);
        if (swapOperation.sourceChain == block.chainid) {
            for (uint256 i = 0; i < swapOperation.tokensIn.length; i++) {
                TokenIn memory tokenIn = swapOperation.tokensIn[i];
                _transferFrom(tokenIn.token, operation.user, swapProposal.executor, tokenIn.amount, isSmartAccount);
            }
        }

        uint256[] memory preBalancesOut = _getTokensOutBalance(swapOperation);
        IExecutor(swapProposal.executor).execute(operation, operationHash, proposal.datas[index]);

        if (swapOperation.destinationChain == block.chainid) {
            uint256[] memory outputs = new uint256[](swapOperation.tokensOut.length);
            for (uint256 i = 0; i < swapOperation.tokensOut.length; i++) {
                TokenOut memory tokenOut = swapOperation.tokensOut[i];
                uint256 postBalanceOut = ERC20Helpers.balanceOf(tokenOut.token, address(this));
                uint256 preBalanceOut = preBalancesOut[i];
                if (postBalanceOut < preBalanceOut) revert SettlerPostBalanceOutLtPre(i, postBalanceOut, preBalanceOut);

                outputs[i] = postBalanceOut - preBalanceOut;
                uint256 proposedAmount = swapProposal.amountsOut[i];
                if (outputs[i] < proposedAmount) revert SettlerAmountOutLtProposed(i, outputs[i], proposedAmount);

                ERC20Helpers.transfer(tokenOut.token, tokenOut.recipient, outputs[i]);
            }

            _emitOperationEvents(operation, proposal, index, abi.encode(outputs));
        }
    }

    /**
     * @dev Validates and executes a proposal to fulfill a transfer operation
     * @param operation Transfer operation to be fulfilled
     * @param proposal Transfer proposal to be executed
     * @param index position where the transfer proposal data is located on datas
     */
    function _executeTransfer(Operation memory operation, Proposal memory proposal, uint256 index) internal {
        TransferOperation memory transferOperation = abi.decode(operation.data, (TransferOperation));
        _validateTransferOperation(transferOperation, proposal.datas[index]);

        bool isSmartAccount = smartAccountsHandler.isSmartAccount(operation.user);
        for (uint256 i = 0; i < transferOperation.transfers.length; i++) {
            TransferData memory transfer = transferOperation.transfers[i];
            _transferFrom(transfer.token, operation.user, transfer.recipient, transfer.amount, isSmartAccount);
        }

        _emitOperationEvents(operation, proposal, index, new bytes(0));
    }

    /**
     * @dev Validates and executes a proposal to fulfill a call operation
     * @param operation Call operation to be fulfilled
     * @param proposal Call proposal to be executed
     * @param index position where the call proposal data is located on datas
     */
    function _executeCall(Operation memory operation, Proposal memory proposal, uint256 index) internal {
        CallOperation memory callOperation = abi.decode(operation.data, (CallOperation));
        _validateCallOperation(callOperation, proposal.datas[index], operation.user);

        bytes[] memory outputs = new bytes[](callOperation.calls.length);
        for (uint256 i = 0; i < callOperation.calls.length; i++) {
            CallData memory call = callOperation.calls[i];
            // solhint-disable-next-line avoid-low-level-calls
            outputs[i] = smartAccountsHandler.call(operation.user, call.target, call.data, call.value);
        }

        _emitOperationEvents(operation, proposal, index, abi.encode(outputs));
    }

    /**
     * @dev Validates an intent and its corresponding proposal
            The off-chain validators are assuring that:
                - Intent.user has authorization over operation.user
                - If there is a cross-chain swap operation, it is the last one
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
        if (getNonceBlock[intent.feePayer][intent.nonce] != 0) {
            revert SettlerNonceAlreadyUsed(intent.feePayer, intent.nonce);
        }

        if (intent.operations.length == 0) revert SettlerIntentOperationsEmpty();
        if (intent.operations.length != proposal.datas.length) revert SettlerProposalDataInvalidLength();

        if (operationsValidator != address(0)) {
            for (uint256 i = 0; i < intent.operations.length; i++) {
                Operation memory operation = intent.operations[i];
                bytes memory safeguard = _userSafeguard[operation.user];
                if (safeguard.length > 0) IOperationsValidator(operationsValidator).validate(operation, safeguard);
            }
        }

        bool shouldValidateDeadlines = _shouldValidateDeadlines(intent);
        if (shouldValidateDeadlines) {
            if (intent.deadline <= block.timestamp) revert SettlerIntentPastDeadline(intent.deadline, block.timestamp);
            bool isProposalPastDeadline = proposal.deadline <= block.timestamp;
            if (isProposalPastDeadline) revert SettlerProposalPastDeadline(proposal.deadline, block.timestamp);
        }

        if (intent.maxFees.length != proposal.fees.length) revert SettlerSolverFeeInvalidLength();
        for (uint256 i = 0; i < intent.maxFees.length; i++) {
            uint256 maxFee = intent.maxFees[i].amount;
            uint256 proposalFee = proposal.fees[i];
            if (proposalFee > maxFee) revert SettlerSolverFeeTooHigh(proposalFee, maxFee);
        }

        uint8 minValidations = IController(controller).minValidations();
        uint256 requiredValidations = intent.minValidations > minValidations ? intent.minValidations : minValidations;

        if (intent.validations.length < requiredValidations) {
            revert SettlerIntentValidationsNotEnough(requiredValidations, intent.validations.length);
        }

        address lastValidator = address(0);
        Validation memory validation = Validation(intent.hash());
        bytes32 typedDataHash = _hashTypedDataV4(validation.hash());
        for (uint256 i = 0; i < intent.validations.length; i++) {
            address validator = ECDSA.recover(typedDataHash, intent.validations[i]);
            if (validator <= lastValidator) {
                revert SettlerValidatorDuplicatedOrUnsorted(lastValidator, validator);
            }
            lastValidator = validator;
            bool isValidatorNotAllowed = !IController(controller).isValidatorAllowed(validator);
            if (isValidatorNotAllowed) revert SettlerValidatorNotAllowed(validator);
        }

        address signer = ECDSA.recover(_hashTypedDataV4(proposal.hash(intent, _msgSender())), signature);
        bool isProposalSignerNotAllowed = !IController(controller).isProposalSignerAllowed(signer) && !simulated;
        if (isProposalSignerNotAllowed) revert SettlerProposalSignerNotAllowed(signer);
    }

    /**
     * @dev Validates a swap operation and its corresponding proposal
     * @param operation Swap operation to be fulfilled
     * @param proposal Proposal to be executed
     */
    function _validateSwapOperation(SwapOperation memory operation, SwapProposal memory proposal) internal view {
        bool isChainInvalid = operation.sourceChain != block.chainid && operation.destinationChain != block.chainid;
        if (isChainInvalid) revert SettlerInvalidChain(block.chainid);

        if (proposal.amountsOut.length != operation.tokensOut.length) revert SettlerInvalidProposedAmounts();

        for (uint256 i = 0; i < operation.tokensOut.length; i++) {
            TokenOut memory tokenOut = operation.tokensOut[i];
            address recipient = tokenOut.recipient;
            if (recipient == address(this)) revert SettlerInvalidRecipient(recipient);

            uint256 minAmount = tokenOut.minAmount;
            uint256 proposedAmount = proposal.amountsOut[i];
            if (proposedAmount < minAmount) revert SettlerProposedAmountLtMinAmount(i, proposedAmount, minAmount);
        }

        if (operation.sourceChain != operation.destinationChain) {
            bool isExecutorInvalid = !IController(controller).isExecutorAllowed(proposal.executor);
            if (isExecutorInvalid) revert SettlerExecutorNotAllowed(proposal.executor);
        }
    }

    /**
     * @dev Validates a transfer operation and its corresponding proposal
     * @param operation Transfer operation to be fulfilled
     * @param proposalData data of the proposal
     */
    function _validateTransferOperation(TransferOperation memory operation, bytes memory proposalData) internal view {
        if (operation.chainId != block.chainid) revert SettlerInvalidChain(block.chainid);
        if (proposalData.length > 0) revert SettlerProposalDataNotEmpty();
        for (uint256 i = 0; i < operation.transfers.length; i++) {
            address recipient = operation.transfers[i].recipient;
            if (recipient == address(this)) revert SettlerInvalidRecipient(recipient);
        }
    }

    /**
     * @dev Validates a call operation and its corresponding proposal
     * @param operation Call operation to be fulfilled
     * @param proposalData data of the proposal
     * @param user The originator of the operation
     */
    function _validateCallOperation(CallOperation memory operation, bytes memory proposalData, address user)
        internal
        view
    {
        if (operation.chainId != block.chainid) revert SettlerInvalidChain(block.chainid);
        if (proposalData.length > 0) revert SettlerProposalDataNotEmpty();
        if (!smartAccountsHandler.isSmartAccount(user)) revert SettlerUserNotSmartAccount(user);
    }

    /**
     * @dev Tells the contract balance for each token out of a swap operation
     * @param operation Swap operation containing the list of tokens out
     */
    function _getTokensOutBalance(SwapOperation memory operation) internal view returns (uint256[] memory balances) {
        balances = new uint256[](operation.tokensOut.length);
        if (operation.destinationChain == block.chainid) {
            for (uint256 i = 0; i < operation.tokensOut.length; i++) {
                balances[i] = ERC20Helpers.balanceOf(operation.tokensOut[i].token, address(this));
            }
        }
    }

    /**
     * @dev Tells if the intent and proposal deadlines should be validated
            In the case the intent is being executed on the destination chain of a cross-chain swap, the deadlines are ignored
     * @param intent Intent to be fulfilled
     */
    function _shouldValidateDeadlines(Intent memory intent) internal view returns (bool) {
        // Validators ensure off-chain that a cross-chain operation can only be the last operation
        Operation memory finalOperation = intent.operations[intent.operations.length - 1];
        if (finalOperation.opType != uint8(OpType.Swap)) return true;
        SwapOperation memory swapIntent = abi.decode(finalOperation.data, (SwapOperation));
        if (swapIntent.sourceChain == swapIntent.destinationChain) return true;
        return swapIntent.sourceChain == block.chainid;
    }

    /**
     * @dev Emits operation custom events
     * @param operation Operation to emit the custom events for
     * @param proposal Proposal that fulfills the operation
     * @param index Position of the operation on operations
     * @param output Encoded array of outputs
     */
    function _emitOperationEvents(
        Operation memory operation,
        Proposal memory proposal,
        uint256 index,
        bytes memory output
    ) internal {
        for (uint256 i = 0; i < operation.events.length; i++) {
            OperationEvent memory operationEvent = operation.events[i];
            emit OperationExecuted(
                operation.user,
                operationEvent.topic,
                uint8(operation.opType),
                operation,
                proposal,
                index,
                output,
                operationEvent.data
            );
        }
    }

    /**
     * @dev Pays fees from the intent feePayer
     * @param intent Intent to be fulfilled
     * @param proposal Proposal to be executed
     */
    function _payFees(Intent memory intent, Proposal memory proposal) internal {
        address from = intent.feePayer;
        address to = _msgSender();
        bool isSmartAccount = smartAccountsHandler.isSmartAccount(from);
        for (uint256 i = 0; i < intent.maxFees.length; i++) {
            address token = intent.maxFees[i].token;
            if (!Denominations.isUSD(token)) _transferFrom(token, from, to, proposal.fees[i], isSmartAccount);
        }
    }

    /**
     * @dev Transfers tokens from one account to another
     * @param token Address of the token to transfer
     * @param from Address of the account sending the tokens
     * @param to Address of the account receiving the tokens
     * @param amount Amount of tokens to transfer
     * @param isSmartAccount Whether the sender is a smart account
     */
    function _transferFrom(address token, address from, address to, uint256 amount, bool isSmartAccount) internal {
        if (isSmartAccount) {
            smartAccountsHandler.transfer(from, token, to, amount);
        } else {
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    /**
     * @dev Sets a new smart accounts handler
     * @param newSmartAccountsHandler New smart accounts handler to be set
     */
    function _setSmartAccountsHandler(address newSmartAccountsHandler) internal {
        if (newSmartAccountsHandler == address(0)) revert SmartAccountsHandlerZero();
        smartAccountsHandler = newSmartAccountsHandler;
        emit SmartAccountsHandlerSet(newSmartAccountsHandler);
    }

    /**
     * @dev Sets the operations validator
     * @param newOperationsValidator New operations validator to be set
     */
    function _setOperationsValidator(address newOperationsValidator) internal {
        operationsValidator = newOperationsValidator;
        emit OperationsValidatorSet(newOperationsValidator);
    }

    /**
     * @dev Sets a safeguard for a user
     * @param user Address of the user to set the safeguard for
     * @param safeguard Safeguard to be set
     */
    function _setSafeguard(address user, bytes memory safeguard) internal {
        delete _userSafeguard[user];
        _userSafeguard[user] = safeguard;
        emit SafeguardSet(user);
    }
}
