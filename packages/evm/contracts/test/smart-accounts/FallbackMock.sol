// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract FallbackMock {
    fallback() external payable {}

    receive() external payable {}
}
