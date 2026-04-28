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
 * @dev Kind of dynamic argument to be encoded
 * @param Literal ABI-encoded literal value provided by the resolver
 * @param Variable Reference to a previously resolved variable value
 */
enum DynamicArgKind {
    Literal,
    Variable
}

/**
 * @dev Represents a single dynamic argument
 * @param kind Type of argument resolution strategy
 * @param data Encoded argument data, interpreted based on `kind`
 * @param isDynamic Whether the resolved argument is ABI-dynamic
 */
struct DynamicArg {
    DynamicArgKind kind;
    bytes data;
    bool isDynamic;
}

/**
 * @dev Represents a dynamic contract call intent
 * @param target Contract address to be called
 * @param value ETH value to be sent with the call
 * @param selector Function selector to invoke
 * @param arguments List of dynamically resolved arguments
 */
struct DynamicCall {
    address target;
    uint256 value;
    bytes4 selector;
    DynamicArg[] arguments;
}
