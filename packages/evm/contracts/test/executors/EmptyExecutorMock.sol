// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/IExecutor.sol';

contract EmptyExecutorMock is IExecutor {
    event Executed();

    function execute(Intent memory, Proposal memory) external override {
        emit Executed();
    }
}
