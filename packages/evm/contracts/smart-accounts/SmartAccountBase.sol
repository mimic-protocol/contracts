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

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/Context.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';

import '../interfaces/ISmartAccount.sol';
import '../utils/ERC20Helpers.sol';

/**
 * @title SmartAccountBase
 * @dev Provides the base logic for managing assets and executing arbitrary calls
 */
contract SmartAccountBase is ISmartAccount, Context, ERC165, ReentrancyGuard {
    /**
     * @dev Tells whether the contract supports the given interface ID. Overrides ERC165 to declare support for ISmartAccount interface.
     * @param interfaceId Interface ID is defined as the XOR of all function selectors in the interface
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
        return interfaceId == type(ISmartAccount).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Transfers ERC20 or native tokens to the recipient
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function transfer(address token, address recipient, uint256 amount) public virtual override nonReentrant {
        ERC20Helpers.transfer(token, recipient, amount);
        emit Transferred(token, recipient, amount);
    }

    /**
     * @dev Executes an arbitrary call from the contract
     * @param target Address where the call will be sent
     * @param data Calldata to be sent to the target
     * @param value Native token value to send along with the call
     * @return result Call response if it was successful, otherwise it reverts
     */
    function call(address target, bytes memory data, uint256 value)
        public
        virtual
        override
        nonReentrant
        returns (bytes memory result)
    {
        result = Address.functionCallWithValue(target, data, value);
        emit Called(target, data, value, result);
    }
}
