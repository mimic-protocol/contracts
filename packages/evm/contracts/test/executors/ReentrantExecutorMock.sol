// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/IExecutor.sol';
import '../../interfaces/ISettler.sol';

contract ReentrantExecutorMock is IExecutor {
    // solhint-disable-next-line immutable-vars-naming
    address payable public immutable settler;

    constructor(address payable _settler) {
        settler = _settler;
    }

    function execute(Intent memory, Proposal memory) external override {
        ISettler(settler).execute(new Execution[](0));
    }
}
