// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../interfaces/IPermissionOracle.sol';

contract PermissionOracleMock is IPermissionOracle {
    function hasPermission(address, bytes memory data) external pure returns (bool) {
        return abi.decode(data, (bool));
    }
}
