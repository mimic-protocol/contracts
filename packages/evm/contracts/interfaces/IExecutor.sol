// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';

/**
 * @title Executor interface
 */
interface IExecutor {
    /**
     * @dev Executes an operation proposal
     * @param operation Operation to be executed
     * @param operationHash unique hash of the operation
     * @param proposalData data of the proposal to be executed to fulfill the operation
     */
    function execute(Operation memory operation, bytes32 operationHash, bytes memory proposalData) external;
}
