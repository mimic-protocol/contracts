// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/IExecutor.sol';

contract EmptyExecutorMock is IExecutor {
    event Executed();

    function execute(Intent memory, Proposal memory, uint256) external override {
        emit Executed();
    }
}
