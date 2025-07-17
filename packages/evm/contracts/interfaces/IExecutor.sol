// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';

interface IExecutor {
    function execute(Intent memory intent, Proposal memory proposal) external;
}
