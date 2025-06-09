// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IExecutor {
    function execute(bytes memory data) external;
}
