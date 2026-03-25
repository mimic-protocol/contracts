// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/IExecutor.sol';
import '../../utils/ERC20Helpers.sol';

/* solhint-disable custom-errors */

contract TransferExecutorMock is IExecutor {
    event Transferred();

    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }

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
            ERC20Helpers.transfer(tokens[i], msg.sender, amounts[i]);
            emit Transferred();
        }
    }
}
