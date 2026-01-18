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
import '../utils/BytesHelpers.sol';

/**
 * @title DynamicCallEncoder
 * @dev Builds calldata for arbitrary contract calls from structured arguments.
 *
 * This encoder supports:
 * - Literal ABI-encoded arguments
 * - Variable references resolved from previous execution results
 * - Nested static calls whose return values are used as arguments
 *
 * The encoder follows standard ABI encoding rules, reconstructing
 * the calldata heads and tails dynamically based on argument types.
 */
contract DynamicCallEncoder {
    using BytesHelpers for bytes;

    /// @dev Thrown when an argument is not word-aligned
    error DynamicCallEncoderBadLength();

    /// @dev Thrown when a dynamic value resolves to empty data
    error DynamicCallEncoderEmptyDynamic();

    /// @dev Thrown when a static literal has an invalid size prefix
    error DynamicCallEncoderBadStaticSize();

    /// @dev Thrown when a static literal does not end with a zero word
    error DynamicCallEncoderBadStaticTrailer();

    /// @dev Thrown when a static literal is too short to be valid
    error DynamicCallEncoderTooShortStatic();

    /// @dev Thrown when a variable reference is not exactly one word
    error DynamicCallEncoderVariableRefBadLength();

    /// @dev Thrown when a variable index is outside the variables array
    error DynamicCallEncoderVariableOutOfBounds();

    /// @dev Thrown when a variable value is too short to be interpreted
    error DynamicCallEncoderVariableTooShort();

    /// @dev Thrown when a static call argument cannot be decoded
    error DynamicCallEncoderStaticCallBadSpec();

    /// @dev Thrown when a staticcall execution fails
    error DynamicCallEncoderStaticCallFailed(address target);

    /**
     * @dev Internal representation of a fully-encoded argument
     * @param data ABI-encoded argument payload:
     *  - static: inline ABI words
     *  - dynamic: tail data ([len][data...])
     * @param isDynamic Whether this argument requires a head offset
     * @param headLength Bytes contributed to the calldata head
     */
    struct EncodedArg {
        bytes data;
        bool isDynamic;
        uint256 headLength;
    }

    /**
     * @dev Encodes a dynamic call into calldata
     * @param call_ Dynamic call specification
     * @param variables List of resolved variable values
     * @return data Fully ABI-encoded calldata
     */
    function encode(DynamicCall memory call_, bytes[] memory variables) external view returns (bytes memory data) {
        data = _buildCalldata(call_.selector, call_.arguments, variables);
    }

    /**
     * @dev Builds calldata from a selector and a list of dynamic arguments
     * This function performs standard ABI aggregation:
     * - static arguments are inlined in the head
     * - dynamic arguments place offsets in the head and append data to the tail
     */
    function _buildCalldata(bytes4 selector, DynamicArg[] memory args, bytes[] memory variables)
        internal
        view
        returns (bytes memory data)
    {
        uint256 n = args.length;
        bytes[] memory encodedArgs = new bytes[](n);
        bool[] memory isDynamic = new bool[](n);
        uint256 headLength = 0;

        for (uint256 i = 0; i < n; i++) {
            EncodedArg memory enc = _encodeArg(args[i], variables);
            encodedArgs[i] = enc.data;
            isDynamic[i] = enc.isDynamic;
            headLength += enc.headLength;
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
    function _encodeArg(DynamicArg memory arg, bytes[] memory variables) internal view returns (EncodedArg memory out) {
        if (arg.kind == DynamicArgKind.Literal) return _encodeLiteral(arg.data);
        if (arg.kind == DynamicArgKind.Variable) return _encodeVariable(arg.data, variables);
        if (arg.kind == DynamicArgKind.StaticCall) return _encodeStaticCall(arg.data, variables);
        revert DynamicCallEncoderStaticCallBadSpec();
    }

    /**
     * @dev Encodes a literal argument. It supports:
     * - Static values encoded as [size][data][0]
     * - Dynamic values pre-encoded with a dynamic ABI prefix
     */
    function _encodeLiteral(bytes memory argument) internal pure returns (EncodedArg memory out) {
        if (argument.length % 32 != 0) revert DynamicCallEncoderBadLength();

        if (_hasDynamicPrefix(argument)) {
            // Dynamic literal: remove pre-encoding prefix
            bytes memory encodedArg = argument.sliceFrom(96);
            if (encodedArg.length == 0) revert DynamicCallEncoderEmptyDynamic();

            out.data = encodedArg;
            out.isDynamic = true;
            out.headLength = 32;
        } else {
            // Static literal: [size][data][zero]
            if (argument.length < 64) revert DynamicCallEncoderTooShortStatic();

            uint256 staticSize = argument.readWord0();
            if (argument.length != staticSize + 32) revert DynamicCallEncoderBadStaticSize();
            if (!argument.lastWordIsZero()) revert DynamicCallEncoderBadStaticTrailer();

            bytes memory encodedArg = argument.slice(32, argument.length - 32);
            out.data = encodedArg;
            out.isDynamic = false;
            out.headLength = encodedArg.length;
        }
    }

    /**
     * @dev Encodes a variable argument by resolving it from the variables list
     */
    function _encodeVariable(bytes memory data, bytes[] memory variables)
        internal
        pure
        returns (EncodedArg memory out)
    {
        if (data.length != 32) revert DynamicCallEncoderVariableRefBadLength();
        uint256 index = data.readWord0();
        if (index >= variables.length) revert DynamicCallEncoderVariableOutOfBounds();
        out = _encodeFromAbiLikeBytes(variables[index]);
    }

    /**
     * @dev Encodes a staticcall argument
     * Executes a staticcall and interprets the return data as an ABI value
     */
    function _encodeStaticCall(bytes memory data, bytes[] memory variables)
        internal
        view
        returns (EncodedArg memory out)
    {
        if (data.length < 64) revert DynamicCallEncoderStaticCallBadSpec();
        DynamicStaticCallArg memory spec = abi.decode(data, (DynamicStaticCallArg));
        bytes memory callData = _buildCalldata(spec.selector, spec.arguments, variables);
        (bool ok, bytes memory result) = spec.target.staticcall(callData);
        if (!ok) revert DynamicCallEncoderStaticCallFailed(spec.target);
        out = _encodeFromAbiLikeBytes(result);
    }

    /**
     * @dev Interprets ABI-like bytes as either a static or dynamic value
     * Used for variable resolution and staticcall return values
     */
    function _encodeFromAbiLikeBytes(bytes memory value) internal pure returns (EncodedArg memory out) {
        if (value.length < 32) revert DynamicCallEncoderVariableTooShort();

        if (_looksLikeSingleDynamicAbiValue(value)) {
            bytes memory tail = value.sliceFrom(32);
            if (tail.length == 0) revert DynamicCallEncoderEmptyDynamic();
            out.data = tail;
            out.isDynamic = true;
            out.headLength = 32;
        } else {
            out.data = value.slice(0, 32);
            out.isDynamic = false;
            out.headLength = 32;
        }
    }

    /**
     * @dev Detects ABI encoding of a single dynamic return value
     */
    function _looksLikeSingleDynamicAbiValue(bytes memory data) private pure returns (bool) {
        if (data.length < 64) return false;
        if (data.length % 32 != 0) return false;
        return data.readWord0() == 0x20;
    }

    /**
     * @dev Detects the dynamic pre-encoding prefix used by abi.encode("", value)
     */
    function _hasDynamicPrefix(bytes memory argument) private pure returns (bool) {
        if (argument.length < 96) return false;

        bytes32 w0;
        bytes32 w1;
        bytes32 w2;

        assembly {
            let off := add(argument, 32)
            w0 := mload(off)
            w1 := mload(add(off, 32))
            w2 := mload(add(off, 64))
        }

        return (uint256(w0) == 0x40) && (uint256(w1) == 0x60) && (w2 == bytes32(0));
    }
}
