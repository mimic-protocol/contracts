// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../TokenMock.sol';
import '../../interfaces/IExecutor.sol';

/* solhint-disable custom-errors */

contract MintExecutorMock is IExecutor {
    event Minted();

    function execute(Intent memory intent, Proposal memory proposal, uint256 index) external override {
        Operation memory operation = intent.operations[index];
        require(
            operation.opType == uint8(OpType.Swap) || operation.opType == uint8(OpType.CrossChainSwap),
            'Invalid operation type'
        );

        SwapProposal memory swapProposal = abi.decode(proposal.datas[index], (SwapProposal));
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(swapProposal.data, (address[], uint256[]));

        require(tokens.length == amounts.length, 'Invalid inputs');

        for (uint256 i = 0; i < tokens.length; i++) {
            TokenMock(tokens[i]).mint(msg.sender, amounts[i]);
            emit Minted();
        }
    }
}
