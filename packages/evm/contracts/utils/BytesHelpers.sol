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

/**
 * @title BytesHelpers
 * @dev Collection of low-level helpers to operate on `bytes` values in memory.
 */
library BytesHelpers {
    /**
     * @dev Thrown when a slice operation exceeds the bounds of the input bytes
     */
    error BytesLibSliceOutOfBounds();

    /**
     * @dev Reads the first 32-byte word of a bytes array
     * @param data Bytes array to read from
     * @return result First ABI word of `data`
     */
    function readWord0(bytes memory data) internal pure returns (uint256 result) {
        assembly {
            result := mload(add(data, 32))
        }
    }

    /**
     * @dev Reads the second 32-byte word of a bytes array
     * @param data Bytes array to read from
     * @return result Second ABI word of `data`
     */
    function readWord1(bytes memory data) internal pure returns (uint256 result) {
        assembly {
            result := mload(add(data, 64))
        }
    }

    /**
     * @dev Checks whether the last 32-byte word of a bytes array is zero
     *
     * Commonly used to validate ABI-encoded static values, which must
     * end with a zero padding word.
     */
    function lastWordIsZero(bytes memory data) internal pure returns (bool) {
        bytes32 last;
        assembly {
            last := mload(add(data, mload(data)))
        }
        return last == bytes32(0);
    }

    /**
     * @dev Returns a slice of a bytes array from `start` (inclusive) to `end` (exclusive)
     * @param data Bytes array to slice
     * @param start Starting byte index (inclusive)
     * @param end Ending byte index (exclusive)
     */
    function slice(bytes memory data, uint256 start, uint256 end) internal pure returns (bytes memory out) {
        if (end < start) revert BytesLibSliceOutOfBounds();
        if (end > data.length) revert BytesLibSliceOutOfBounds();

        uint256 len = end - start;
        out = new bytes(len);

        assembly {
            let src := add(add(data, 32), start)
            let dst := add(out, 32)
            for {
                let i := 0
            } lt(i, len) {
                i := add(i, 32)
            } {
                mstore(add(dst, i), mload(add(src, i)))
            }
        }
    }

    /**
     * @dev Returns a slice of a bytes array starting at `start` until the end
     * @param data Bytes array to slice
     * @param start Starting byte index (inclusive)
     */
    function sliceFrom(bytes memory data, uint256 start) internal pure returns (bytes memory out) {
        return slice(data, start, data.length);
    }
}
