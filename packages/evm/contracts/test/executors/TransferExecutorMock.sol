// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../utils/ERC20Helpers.sol';

contract TransferExecutorMock {
    event Transferred();

    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }

    function transfer(address token, uint256 amount) external {
        ERC20Helpers.transfer(token, msg.sender, amount);
        emit Transferred();
    }

    function transfers(address token1, uint256 amount1, address token2, uint256 amount2) external {
        ERC20Helpers.transfer(token1, msg.sender, amount1);
        ERC20Helpers.transfer(token2, msg.sender, amount2);
        emit Transferred();
    }
}
