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

    function execute(Intent memory intent, Proposal memory proposal) external override {
        require(intent.op == OpType.Swap, 'Invalid intent type');

        SwapProposal memory swapProposal = abi.decode(proposal.data, (SwapProposal));
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(swapProposal.data, (address[], uint256[]));

        require(tokens.length == amounts.length, 'Invalid inputs');

        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Helpers.transfer(tokens[i], msg.sender, amounts[i]);
            emit Transferred();
        }
    }
}
