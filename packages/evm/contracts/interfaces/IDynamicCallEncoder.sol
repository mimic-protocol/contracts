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
     * @dev The static literal has an invalid size prefix
     */
    error DynamicCallEncoderBadStaticSize();

    /**
     * @dev The static literal does not end with a zero word
     */
    error DynamicCallEncoderBadStaticTrailer();

    /**
     * @dev The static literal is too short to be valid
     */
    error DynamicCallEncoderTooShortStatic();

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
     * @dev The variable value is too short to be interpreted
     */
    error DynamicCallEncoderVariableTooShort();

    /**
     * @dev The static call argument cannot be decoded
     */
    error DynamicCallEncoderStaticCallBadSpec();

    /**
     * @dev Encodes a dynamic call into calldata.
     * @param dynamicCall Dynamic call specification.
     * @param variables List of resolved variable values.
     * @param variablesLength Number of resolved variables.
     */
    function encode(DynamicCall memory dynamicCall, bytes[][] memory variables, uint256 variablesLength)
        external
        view
        returns (bytes memory);
}
