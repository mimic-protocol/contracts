// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../interfaces/ISafe.sol';

contract SafeMock is ISafe {
    event ModuleTxExecuted(
        address indexed target,
        bytes data,
        uint256 value,
        SafeOperation operation,
        bool success,
        bytes result
    );

    receive() external payable {}

    function getThreshold() external pure returns (uint256) {
        return 1;
    }

    function execTransactionFromModuleReturnData(address to, uint256 value, bytes memory data, SafeOperation operation)
        external
        returns (bool success, bytes memory result)
    {
        // solhint-disable-next-line avoid-low-level-calls
        (success, result) = to.call{ value: value }(data);
        emit ModuleTxExecuted(to, data, value, operation, success, result);
    }
}
