// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract StaticCallMock {
    function returnUint(uint256 value) external pure returns (uint256) {
        return value;
    }

    function returnAddress(address value) external pure returns (address) {
        return value;
    }

    function returnArray(uint256[] calldata value) external pure returns (uint256[] memory) {
        return value;
    }
}
