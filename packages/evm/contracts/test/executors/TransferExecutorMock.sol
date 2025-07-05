// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/IExecutor.sol';
import '../../utils/ERC20Helpers.sol';

contract TransferExecutorMock is IExecutor {
    event Transferred();

    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }

    function execute(bytes memory data) external override {
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(data, (address[], uint256[]));
        // solhint-disable-next-line custom-errors
        require(tokens.length == amounts.length, 'Invalid inputs');
        for (uint256 i = 0; i < tokens.length; i++) {
            ERC20Helpers.transfer(tokens[i], msg.sender, amounts[i]);
            emit Transferred();
        }
    }
}
