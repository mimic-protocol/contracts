// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

enum SafeOperation {
    Call,
    DelegateCall
}

interface ISafe {
    function getThreshold() external view returns (uint256);

    function execTransactionFromModuleReturnData(address to, uint256 value, bytes memory data, SafeOperation operation)
        external
        returns (bool success, bytes memory returnData);
}
