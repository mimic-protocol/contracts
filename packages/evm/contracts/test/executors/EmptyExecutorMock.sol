// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract EmptyExecutorMock {
    event Executed();

    fallback() external payable {
        emit Executed();
    }
}
