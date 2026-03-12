// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @dev Enum representing the type of intent operation.
 * - Swap: Swap tokens between chains or tokens.
 * - Transfer: Transfer tokens to one or more recipients.
 * - Call: Execute arbitrary contract calls.
 */
enum OpType {
    Swap,
    Transfer,
    Call
}

/**
 * @dev EIP-712 typed data struct representing a validator's approval of an intent.
 * @param intent The hash of the intent being validated.
 */
struct Validation {
    bytes32 intent;
}

/**
 * @dev General intent structure with different operations.
 * @param user The originator of the intent.
 * @param settler The address responsible for executing the intent on-chain.
 * @param nonce A unique value used to prevent replay attacks and distinguish intents.
 * @param deadline The timestamp by which the intent must be executed.
 * @param maxFees List of max fees the user is willing to pay for the intent.
 * @param triggerSig The signature of the trigger that this intent belongs to
 * @param minValidations The minimum number of validator approvals required for this intent to be considered valid.
 * @param validations The list validator signatures attesting to this intent.
 * @param operations List of operations of the intent.
 */
struct Intent {
    address user;
    address settler;
    bytes32 nonce;
    uint256 deadline;
    MaxFee[] maxFees;
    bytes triggerSig;
    uint256 minValidations;
    bytes[] validations;
    Operation[] operations;
}

/**
 * @dev Operation structure used to abstract over different operation types.
 * @param opType The type of operation this operation represents.
 * @param user The user of the operation.
 * @param data ABI-encoded data representing a specific operation type (e.g. SwapOperation, TransferOperation, CallOperation).
 * @param events List of custom operation events to be emitted.
 */
struct Operation {
    uint8 opType;
    address user;
    bytes data;
    OperationEvent[] events;
}

/**
 * @dev Max fee representation
 * @param token Token used to pay for the execution fee.
 * @param amount Max amount of fee token to be paid for settling this intent.
 */
struct MaxFee {
    address token;
    uint256 amount;
}

/**
 * @dev Operation event representation.
 * @param topic Event topic to be emitted.
 * @param data Event data to be emitted.
 */
struct OperationEvent {
    bytes32 topic;
    bytes data;
}

/**
 * @dev Represents a swap operation between two chains.
 * @param sourceChain Chain ID where tokens will be sent from.
 * @param destinationChain Chain ID where tokens will be received.
 * @param tokensIn List of input tokens and amounts to swap.
 * @param tokensOut List of expected output tokens, minimum amounts, and recipients.
 */
struct SwapOperation {
    uint256 sourceChain;
    uint256 destinationChain;
    TokenIn[] tokensIn;
    TokenOut[] tokensOut;
}

/**
 * @dev Token in representation.
 * @param token Address of a token to be sent.
 * @param amount Amount of tokens to be sent.
 */
struct TokenIn {
    address token;
    uint256 amount;
}

/**
 * @dev Token out representation.
 * @param token Address of a token to be received.
 * @param minAmount Minimum amount of tokens to be received.
 * @param recipient Recipient address that will receive the token out.
 */
struct TokenOut {
    address token;
    uint256 minAmount;
    address recipient;
}

/**
 * @dev Represents a transfer operation containing multiple token transfers.
 * @param chainId Chain ID where the transfers should be executed.
 * @param transfers List of token transfers to be performed.
 */
struct TransferOperation {
    uint256 chainId;
    TransferData[] transfers;
}

/**
 * @dev Transfer data for a single token transfer.
 * @param token Address of the token to transfer.
 * @param amount Amount of the token to transfer.
 * @param recipient Recipient of the token transfer.
 */
struct TransferData {
    address token;
    uint256 amount;
    address recipient;
}

/**
 * @dev Represents a generic call operation consisting of one or more contract calls.
 * @param chainId Chain ID where the calls should be executed.
 * @param calls List of low-level contract calls to be executed.
 */
struct CallOperation {
    uint256 chainId;
    CallData[] calls;
}

/**
 * @dev Low-level call data for a target contract interaction.
 * @param target Target contract address.
 * @param data Calldata to be sent to the target.
 * @param value ETH value to send along with the call.
 */
struct CallData {
    address target;
    bytes data;
    uint256 value;
}

/**
 * @dev Generic proposal structure representing a solver’s response to an intent.
 * @param deadline Timestamp until when the proposal is valid.
 * @param datas List of ABI-encoded proposal-specific data (e.g. SwapProposal).
 * @param fees List of fee amounts the solver requires for execution.
 */
struct Proposal {
    uint256 deadline;
    bytes[] datas;
    uint256[] fees;
}

/**
 * @dev Swap proposal representation for a swap operation.
 * @param executor Address of the executor contract that should be called during operation execution.
 * @param data Arbitrary data used to call the executor contract.
 * @param amountsOut List of amounts of tokens out proposed by the solver.
 */
struct SwapProposal {
    address executor;
    bytes data;
    uint256[] amountsOut;
}

library IntentsHelpers {
    bytes32 internal constant INTENT_TYPE_HASH =
        keccak256(
            'Intent(address user,address settler,bytes32 nonce,uint256 deadline,MaxFee[] maxFees,bytes triggerSig,uint256 minValidations,Operation[] operations)MaxFee(address token,uint256 amount)Operation(uint8 opType,address user,bytes data,OperationEvent[] events,bytes32 intentNonce,uint256 index)OperationEvent(bytes32 topic,bytes data)'
        );

    bytes32 internal constant PROPOSAL_TYPE_HASH =
        keccak256('Proposal(bytes32 intent,address solver,uint256 deadline,bytes[] datas,uint256[] fees)');

    bytes32 internal constant VALIDATION_TYPE_HASH = keccak256('Validation(bytes32 intent)');

    bytes32 internal constant MAX_FEE_TYPE_HASH = keccak256('MaxFee(address token,uint256 amount)');

    bytes32 internal constant OPERATION_TYPE_HASH =
        keccak256(
            'Operation(uint8 opType,address user,bytes data,OperationEvent[] events,bytes32 intentNonce,uint256 index)'
        );

    bytes32 internal constant OPERATION_EVENT_TYPE_HASH = keccak256('OperationEvent(bytes32 topic,bytes data)');

    function hash(Intent memory intent) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    INTENT_TYPE_HASH,
                    intent.user,
                    intent.settler,
                    intent.nonce,
                    intent.deadline,
                    hash(intent.maxFees),
                    intent.triggerSig,
                    intent.minValidations,
                    hash(intent.operations, intent.nonce)
                )
            );
    }

    function hash(Proposal memory proposal, Intent memory intent, address solver) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    PROPOSAL_TYPE_HASH,
                    hash(intent),
                    solver,
                    proposal.deadline,
                    hash(proposal.datas),
                    hash(proposal.fees)
                )
            );
    }

    function hash(MaxFee[] memory fees) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](fees.length);
        for (uint256 i = 0; i < fees.length; i++) {
            hashes[i] = keccak256(abi.encode(MAX_FEE_TYPE_HASH, fees[i].token, fees[i].amount));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hash(Operation[] memory operations, bytes32 intentNonce) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](operations.length);
        for (uint256 i = 0; i < operations.length; i++) {
            hashes[i] = hash(operations[i], intentNonce, i);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hash(Operation memory operation, bytes32 intentNonce, uint256 index) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    OPERATION_TYPE_HASH,
                    operation.opType,
                    operation.user,
                    keccak256(operation.data),
                    hash(operation.events),
                    intentNonce,
                    index
                )
            );
    }

    function hash(OperationEvent[] memory events) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](events.length);
        for (uint256 i = 0; i < events.length; i++) {
            hashes[i] = keccak256(abi.encode(OPERATION_EVENT_TYPE_HASH, events[i].topic, keccak256(events[i].data)));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hash(uint256[] memory fees) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(fees));
    }

    function hash(bytes[] memory datas) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](datas.length);
        for (uint256 i = 0; i < datas.length; i++) {
            hashes[i] = keccak256(datas[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hash(Validation memory validation) internal pure returns (bytes32) {
        return keccak256(abi.encode(VALIDATION_TYPE_HASH, validation.intent));
    }
}
