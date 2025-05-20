// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../TokenMock.sol';

contract MintExecutorMock {
    event Minted();

    function mint(address token, uint256 amount) external {
        TokenMock(token).mint(msg.sender, amount);
        emit Minted();
    }

    function mints(address token1, uint256 amount1, address token2, uint256 amount2) external {
        TokenMock(token1).mint(msg.sender, amount1);
        TokenMock(token2).mint(msg.sender, amount2);
        emit Minted();
    }
}
