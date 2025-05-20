// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/ISettler.sol';

contract ReentrantExecutorMock {
    // solhint-disable-next-line immutable-vars-naming
    address payable public immutable settler;

    constructor(address payable _settler) {
        settler = _settler;
    }

    function execute(Intent memory intent, Proposal memory proposal, bytes memory signature) external {
        ISettler(settler).execute(intent, proposal, signature);
    }
}
