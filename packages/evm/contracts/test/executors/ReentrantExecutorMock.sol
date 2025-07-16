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

    function execute(Intent memory intent, Proposal memory proposal) external override {
        // solhint-disable-next-line custom-errors
        require(intent.op == OpType.Swap, 'Invalid intent type');
        SwapProposal memory swapProposal = abi.decode(proposal.data, (SwapProposal));
        Execution[] memory executions = abi.decode(swapProposal.data, (Execution[]));
        ISettler(settler).execute(executions);
    }
}
