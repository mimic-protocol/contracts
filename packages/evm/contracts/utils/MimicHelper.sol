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

import { Math } from '@openzeppelin/contracts/utils/math/Math.sol';

/**
 * @title Mimic Helper
 * @dev Collection of helper functions for the Mimic Protocol
 */
contract MimicHelper {
    // Basis points scale
    uint16 internal constant BPS_SCALE = 10_000;

    // Custom byte storage per user and key
    mapping (address => mapping (string => bytes)) internal _customStorage;

    /**
     * @dev Emitted every time the storage is set
     */
    event StorageSet(address indexed user, string indexed key, bytes indexed data);

    /**
     * @dev A single percent is greater than 10_000 basis points
     */
    error MimicHelperInvalidPercent();

    /**
     * @dev Tells the native token balance of an address
     * @param target Address to get native token balance
     */
    function getNativeTokenBalance(address target) external view returns (uint256) {
        return target.balance;
    }

    /**
     * @dev Tells the code of an address
     * @param target Address to get code
     */
    function getCode(address target) external view returns (bytes memory) {
        return target.code;
    }

    /**
     * @dev Tells the data set for the user and the key
     * @param user Address of the user being queried
     * @param key String of the key being queried
     */
    function getStorage(address user, string calldata key) external view returns (bytes memory) {
        return _customStorage[user][key];
    }

    /**
     * @dev Sets a data for the user and a key
     * @param key String of the key to set the data for
     * @param data Bytes to be set
     */
    function setStorage(string calldata key, bytes memory data) external {
        _customStorage[msg.sender][key] = data;
        emit StorageSet(msg.sender, key, data);
    }

    /**
     * @dev Tells a percentage of an amount, rounding down
     * @param amount Amount to compute the percentage of
     * @param percent Percentage to apply, expressed in basis points. 10_000 = 100%, 50 = 0.5%
     */
    function pct(uint256 amount, uint16 percent) external pure returns (uint256) {
        if (percent > BPS_SCALE) revert MimicHelperInvalidPercent();
        return Math.mulDiv(amount, percent, BPS_SCALE);
    }
}
