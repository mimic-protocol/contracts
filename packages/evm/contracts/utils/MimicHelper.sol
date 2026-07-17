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
    // Custom byte storage per user and key
    mapping (address => mapping (string => bytes)) internal _customStorage;

    /**
     * @dev Emitted every time the storage is set
     */
    event StorageSet(address indexed user, string indexed key, bytes indexed data);

    /**
     * @dev The percents add up to 100 or more
     */
    error MimicHelperInvalidPercent();

    /**
     * @dev The percents array is empty
     */
    error MimicHelperEmptyPercents();

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
     * @dev Splits an amount by specified percentages.
     * All remainder goes to the last split.
     * @param amount Amount to be split
     * @param percents Array of percents
     * @return splits Array of `percents.length + 1` amounts; the last element holds the remainder
     */
    function pct(uint256 amount, uint8[] calldata percents) external pure returns (uint256[] memory splits) {
        uint256 len = percents.length;
        if (len == 0) revert MimicHelperEmptyPercents();

        splits = new uint256[](len + 1);
        uint256 pctSum = 0;
        uint256 amountSum = 0;

        for (uint256 i = 0; i < len; i++) {
            splits[i] = Math.mulDiv(amount, percents[i], 100);
            amountSum += splits[i];
            pctSum += percents[i];
        }
        if (pctSum >= 100) revert MimicHelperInvalidPercent();

        splits[len] = amount - amountSum; // absorbs rounding dust; never underflows since pctSum < 100
        return splits;
    }
}
