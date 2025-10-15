// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/interfaces/IERC1271.sol';

import './ISmartAccount.sol';

/**
 * @title SmartAccountContract interface
 */
interface ISmartAccountContract is ISmartAccount, IERC1271 {
    // solhint-disable-previous-line no-empty-blocks
}
