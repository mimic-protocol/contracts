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

pragma solidity ^0.8.24;

import '../../utils/BytesHelpers.sol';

contract BytesHelpersMock {
    using BytesHelpers for bytes;

    function readWord0(bytes memory data) external pure returns (uint256) {
        return data.readWord0();
    }

    function readWord1(bytes memory data) external pure returns (uint256) {
        return data.readWord1();
    }

    function slice(bytes memory data, uint256 start, uint256 end) external pure returns (bytes memory) {
        return data.slice(start, end);
    }

    function sliceFrom(bytes memory data, uint256 start) external pure returns (bytes memory) {
        return data.sliceFrom(start);
    }
}
