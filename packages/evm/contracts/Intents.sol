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
 * @dev Execution structure.
 * @param intent Intent to be fulfilled.
 * @param proposal Proposal to be executed.
 * @param signature Proposal signature.
 */
struct Execution {
    Intent intent;
    Proposal proposal;
    bytes signature;
}

/**
 * @dev General intent structure used to abstract over different intent types.
 * @param op The type of operation this intent represents.
 * @param user The originator of the intent.
 * @param settler The address responsible for executing the intent on-chain.
 * @param nonce A unique value used to prevent replay attacks and distinguish intents.
 * @param deadline The timestamp by which the intent must be executed.
 * @param data ABI-encoded data representing a specific intent type (e.g. SwapIntent, TransferIntent, CallIntent).
 * @param maxFees List of max fees the user is willing to pay for the intent.
 */
struct Intent {
    uint8 op;
    address user;
    address settler;
    bytes32 nonce;
    uint256 deadline;
    bytes data;
    MaxFee[] maxFees;
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
 * @dev Represents a swap intent between two chains.
 * @param sourceChain Chain ID where tokens will be sent from.
 * @param destinationChain Chain ID where tokens will be received.
 * @param tokensIn List of input tokens and amounts to swap.
 * @param tokensOut List of expected output tokens, minimum amounts, and recipients.
 */
struct SwapIntent {
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
 * @dev Represents a transfer intent containing multiple token transfers.
 * @param chainId Chain ID where the transfers should be executed.
 * @param transfers List of token transfers to be performed.
 */
struct TransferIntent {
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
 * @dev Represents a generic call intent consisting of one or more contract calls.
 * @param chainId Chain ID where the calls should be executed.
 * @param calls List of low-level contract calls to be executed.
 */
struct CallIntent {
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
 * @param data ABI-encoded proposal-specific data (e.g. SwapProposal).
 * @param fees List of fee amounts the solver requires for execution.
 */
struct Proposal {
    uint256 deadline;
    bytes data;
    uint256[] fees;
}

/**
 * @dev Swap proposal representation for a swap intent.
 * @param executor Address of the executor contract that should be called during intent execution.
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
            'Intent(uint8 op,address user,address settler,bytes32 nonce,uint256 deadline,bytes data,MaxFee[] maxFees)MaxFee(address token,uint256 amount)'
        );

    bytes32 internal constant PROPOSAL_TYPE_HASH =
        keccak256('Proposal(bytes32 intent,address solver,uint256 deadline,bytes data,uint256[] fees)');

    bytes32 internal constant MAX_FEE_TYPE_HASH = keccak256('MaxFee(address token,uint256 amount)');

    function hash(Intent memory intent) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    INTENT_TYPE_HASH,
                    intent.op,
                    intent.user,
                    intent.settler,
                    intent.nonce,
                    intent.deadline,
                    keccak256(intent.data),
                    hash(intent.maxFees)
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
                    keccak256(proposal.data),
                    hash(proposal.fees)
                )
            );
    }

    function hash(MaxFee[] memory fees) internal pure returns (bytes32) {
        bytes32[] memory feeHashes = new bytes32[](fees.length);
        for (uint256 i = 0; i < fees.length; i++) {
            feeHashes[i] = keccak256(abi.encode(MAX_FEE_TYPE_HASH, fees[i].token, fees[i].amount));
        }
        return keccak256(abi.encodePacked(feeHashes));
    }

    function hash(uint256[] memory fees) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(fees));
    }
}
