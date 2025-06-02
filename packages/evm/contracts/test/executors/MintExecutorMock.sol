// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../TokenMock.sol';
import '../../interfaces/IExecutor.sol';

contract MintExecutorMock is IExecutor {
    event Minted();

    function execute(bytes memory data) external override {
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(data, (address[], uint256[]));
        require(tokens.length == amounts.length, 'Invalid inputs');
        for (uint256 i = 0; i < tokens.length; i++) {
            TokenMock(tokens[i]).mint(msg.sender, amounts[i]);
            emit Minted();
        }
    }
}
