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

    function execute(Operation memory, Proposal memory proposal) external override {
        Intent memory intent;
        ISettler(settler).execute(intent, proposal, new bytes(0));
    }
}
