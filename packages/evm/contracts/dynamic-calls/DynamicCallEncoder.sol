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

import './DynamicCallTypes.sol';
import '../interfaces/IDynamicCallEncoder.sol';
import '../utils/BytesHelpers.sol';

/**
 * @title DynamicCallEncoder
 * @dev Builds calldata for arbitrary contract calls from structured arguments.
 *
 * This encoder supports:
 * - Literal ABI-encoded arguments
 * - Variable references resolved from previous execution results
 *
 * The encoder follows standard ABI encoding rules, reconstructing
 * the calldata heads and tails dynamically based on argument types.
 */
contract DynamicCallEncoder is IDynamicCallEncoder {
    using BytesHelpers for bytes;

    /**
     * @dev Internal representation of a fully-encoded argument
     * @param data ABI-encoded argument payload
     * @param isDynamic Whether this argument requires a head offset
     */
    struct EncodedArg {
        bytes data;
        bool isDynamic;
    }

    /**
     * @dev Encodes a dynamic call into calldata
     * @param dynamicCall Dynamic call specification
     * @param variables List of resolved variable values
     * @param variablesLength Number of resolved variables
     * @return data Fully ABI-encoded calldata
     */
    function encode(DynamicCall memory dynamicCall, bytes[][] memory variables, uint256 variablesLength)
        external
        pure
        override
        returns (bytes memory data)
    {
        if (variablesLength > variables.length) revert DynamicCallEncoderVariablesLengthOutOfBounds();
        data = _buildCalldata(dynamicCall.selector, dynamicCall.arguments, variables, variablesLength);
    }

    /**
     * @dev Builds calldata from a selector and a list of dynamic arguments
     * This function performs standard ABI aggregation:
     * - static arguments are inlined in the head
     * - dynamic arguments place offsets in the head and append data to the tail
     */
    function _buildCalldata(
        bytes4 selector,
        DynamicArg[] memory args,
        bytes[][] memory variables,
        uint256 variablesLength
    ) internal pure returns (bytes memory data) {
        uint256 n = args.length;
        bytes[] memory encodedArgs = new bytes[](n);
        bool[] memory isDynamic = new bool[](n);
        uint256 headLength = 0;

        for (uint256 i = 0; i < n; i++) {
            EncodedArg memory enc = _encodeArg(args[i], variables, variablesLength);
            encodedArgs[i] = enc.data;
            isDynamic[i] = enc.isDynamic;
            headLength += enc.isDynamic ? 32 : enc.data.length;
        }

        bytes memory heads;
        bytes memory tails;
        uint256 nextDynamicHead = headLength;

        for (uint256 i = 0; i < n; i++) {
            if (isDynamic[i]) {
                heads = bytes.concat(heads, bytes32(nextDynamicHead));
                tails = bytes.concat(tails, encodedArgs[i]);
                nextDynamicHead += encodedArgs[i].length;
            } else {
                heads = bytes.concat(heads, encodedArgs[i]);
            }
        }

        data = bytes.concat(selector, heads, tails);
    }

    /**
     * @dev Encodes a single dynamic argument based on its kind
     */
    function _encodeArg(DynamicArg memory arg, bytes[][] memory variables, uint256 variablesLength)
        internal
        pure
        returns (EncodedArg memory out)
    {
        if (arg.kind == DynamicArgKind.Literal) return _encodeLiteral(arg);
        if (arg.kind == DynamicArgKind.Variable) return _encodeVariable(arg, variables, variablesLength);
        revert DynamicCallEncoderInvalidArgKind();
    }

    /**
     * @dev Encodes a literal argument
     */
    function _encodeLiteral(DynamicArg memory arg) internal pure returns (EncodedArg memory) {
        return _encodeAbiValue(arg.data, arg.isDynamic);
    }

    /**
     * @dev Encodes a variable argument by resolving it from the variables list
     */
    function _encodeVariable(DynamicArg memory arg, bytes[][] memory variables, uint256 variablesLength)
        internal
        pure
        returns (EncodedArg memory)
    {
        if (arg.data.length != 64) revert DynamicCallEncoderVariableRefBadLength();
        uint256 opIndex = arg.data.readWord0();
        uint256 subIndex = arg.data.readWord1();
        if (opIndex >= variablesLength) revert DynamicCallEncoderVariableOutOfBounds();
        if (subIndex >= variables[opIndex].length) revert DynamicCallEncoderVariableOutOfBounds();

        return _encodeAbiValue(variables[opIndex][subIndex], arg.isDynamic);
    }

    /**
     * @dev Interprets ABI-like bytes as either a static or dynamic value. Used for variable resolution.
     */
    function _encodeAbiValue(bytes memory data, bool isDynamic) internal pure returns (EncodedArg memory out) {
        if (data.length == 0 || data.length % 32 != 0) revert DynamicCallEncoderBadLength();

        if (isDynamic) {
            if (data.length < 64) revert DynamicCallEncoderEmptyDynamic();
            if (data.readWord0() != 0x20) revert DynamicCallEncoderBadLength();

            out.data = data.sliceFrom(32);
            out.isDynamic = true;
        } else {
            out.data = data;
            out.isDynamic = false;
        }
    }
}
