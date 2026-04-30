// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract StaticCallMock {
    struct StructMock {
        uint256 a;
        address b;
    }

    function returnUint(uint256 value) external pure returns (uint256) {
        return value;
    }

    function returnAddress(address value) external payable returns (address) {
        return value;
    }

    function returnArray(uint256[] calldata value) external pure returns (uint256[] memory) {
        return value;
    }

    function returnFixedArray(uint256[3] calldata value) external pure returns (uint256[3] memory) {
        return value;
    }

    function returnStruct(StructMock calldata value) external pure returns (StructMock memory) {
        return value;
    }
}
