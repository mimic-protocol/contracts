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
import './SmartAccountBase.sol';

/**
 * @title SmartAccount7702
 * @dev Provides the smart account logic to use with EIP7702
 */
contract SmartAccount7702 is SmartAccountBase {
    // Mimic settler reference
    // solhint-disable-next-line immutable-vars-naming
    address public immutable settler;

    /**
     * @dev The sender is not the settler
     */
    error SmartAccount7702SenderNotSettler();

    /**
     * @dev Reverts unless the sender is the settler
     */
    modifier onlySettler() {
        if (_msgSender() != settler) revert SmartAccount7702SenderNotSettler();
        _;
    }

    /**
     * @dev Creates a new SmartAccount7702 contract
     * @param _settler Address of the Mimic settler
     */
    constructor(address _settler) {
        settler = _settler;
    }

    /**
     * @dev Transfers ERC20 or native tokens to the recipient. Sender must be the settler.
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function transfer(address token, address recipient, uint256 amount) public override onlySettler {
        super.transfer(token, recipient, amount);
    }

    /**
     * @dev Executes an arbitrary call from the contract. Sender must be the settler.
     * @param target Address where the call will be sent
     * @param data Calldata to be sent to the target
     * @param value Native token value to send along with the call
     * @return result Call response if it was successful, otherwise it reverts
     */
    function call(address target, bytes memory data, uint256 value) public override onlySettler returns (bytes memory) {
        // solhint-disable-next-line avoid-low-level-calls
        return super.call(target, data, value);
    }
}
