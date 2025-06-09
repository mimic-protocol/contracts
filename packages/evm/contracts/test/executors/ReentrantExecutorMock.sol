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

    function execute(bytes memory data) external override {
        (Execution[] memory executions) = abi.decode(data, (Execution[]));
        ISettler(settler).execute(executions);
    }
}
