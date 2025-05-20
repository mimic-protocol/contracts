// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract CallMock {
    event CallReceived(address indexed sender, uint256 value);

    function call() external payable {
        emit CallReceived(msg.sender, msg.value);
    }
}
