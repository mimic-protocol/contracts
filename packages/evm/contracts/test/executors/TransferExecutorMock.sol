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

    function execute(Operation memory operation, bytes32, bytes memory proposalData) external override {
        require(operation.op == uint8(OpType.Swap), 'Invalid operation type');

        SwapProposal memory swapProposal = abi.decode(proposalData, (SwapProposal));
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(swapProposal.data, (address[], uint256[]));

        require(tokens.length == amounts.length, 'Invalid inputs');

        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Helpers.transfer(tokens[i], msg.sender, amounts[i]);
            emit Transferred();
        }
    }
}
