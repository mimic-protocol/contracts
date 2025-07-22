// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';

/**
 * @title Executor interface
 */
interface IExecutor {
    /**
     * @dev Executes an intent proposal
     * @param intent Intent to be executed
     * @param proposal Proposal to be executed to fulfill the intent
     */
    function execute(Intent memory intent, Proposal memory proposal) external;
}
