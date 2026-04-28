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

import '../dynamic-calls/DynamicCallTypes.sol';

interface IDynamicCallEncoder {
    /**
     * @dev The argument is not word-aligned
     */
    error DynamicCallEncoderBadLength();

    /**
     * @dev The dynamic value resolves to empty data
     */
    error DynamicCallEncoderEmptyDynamic();

    /**
     * @dev The variable reference is not exactly one word
     */
    error DynamicCallEncoderVariableRefBadLength();

    /**
     * @dev The variable index is outside the variables array
     */
    error DynamicCallEncoderVariableOutOfBounds();

    /**
     * @dev The declared variables length exceeds the variables array length
     */
    error DynamicCallEncoderVariablesLengthOutOfBounds();

    /**
     * @dev The argument kind is not valid
     */
    error DynamicCallEncoderInvalidArgKind();

    /**
     * @dev Encodes a dynamic call into calldata.
     * @param dynamicCall Dynamic call specification.
     * @param variables List of resolved variable values.
     * @param variablesLength Number of resolved variables.
     */
    function encode(DynamicCall memory dynamicCall, bytes[][] memory variables, uint256 variablesLength)
        external
        pure
        returns (bytes memory);
}
