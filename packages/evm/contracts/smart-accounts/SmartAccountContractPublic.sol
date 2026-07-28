// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.20;

import './SmartAccountContract.sol';

/**
 * @title SmartAccountContractPublic
 * @dev Provides the smart account logic for public use
 */
contract SmartAccountContractPublic is SmartAccountContract {
    /**
     * @dev The setAllowedSigners function is disabled
     */
    error SmartAccountSetAllowedSignersDisabled();

    /**
     * @dev Creates a new SmartAccount contract
     * @param _settler Address of the Mimic settler
     * @param _owner Address that will own the contract
     */
    constructor(address _settler, address _owner) SmartAccountContract(_settler, _owner) {}

    /**
     * @dev Tells whether the signature provided is valid. Any well-formed signature is considered valid.
     * @param hash Message signed by the account
     * @param signature Signature provided to be verified
     */
    function isValidSignature(bytes32 hash, bytes memory signature) external pure override returns (bytes4) {
        (address signer, , ) = ECDSA.tryRecover(hash, signature);
        return signer != address(0) ? EIP1271_MAGIC_VALUE : EIP1271_INVALID_SIGNATURE;
    }

    /**
     * @dev Disabled to prevent accidental misuse.
     */
    function setAllowedSigners(address[] memory, bool[] memory) external view override onlyOwner {
        revert SmartAccountSetAllowedSignersDisabled();
    }
}
