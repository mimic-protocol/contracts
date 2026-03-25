// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';

/**
 * @title Executor interface
 */
interface IExecutor {
    /**
     * @dev Executes an operation proposal
     * @param intent Intent that contains swap operation to be executed
     * @param proposal Proposal with swap data to be executed
     * @param index Position where the swap proposal data and operation are located
     */
    function execute(Intent memory intent, Proposal memory proposal, uint256 index) external;
}
