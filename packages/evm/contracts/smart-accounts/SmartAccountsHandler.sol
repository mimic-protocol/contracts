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

import '../interfaces/ISmartAccount.sol';
import '../interfaces/ISmartAccountHandler.sol';

contract SmartAccountHandler is ISmartAccountHandler {
    /**
     * @dev Tells whether an account is a supported smart account
     * @param account Address of the account being queried
     */
    function isSmartAccount(address account) external view override returns (bool) {
        if (account.code.length == 0) return false;
        if (_isMimicSmartAccount(account)) return true;
        return false;
    }

    /**
     * @dev Performs a transfer from a smart account
     */
    function transfer(address account, address token, address to, uint256 amount) external override {
        if (_isMimicSmartAccount(account)) return ISmartAccount(account).transfer(token, to, amount);
        revert SmartAccountHandlerUnsupportedAccount(account);
    }

    /**
     * @dev Performs a call from a smart account
     */
    function call(address account, address target, bytes calldata data, uint256 value)
        external
        override
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        if (_isMimicSmartAccount(account)) return ISmartAccount(account).call(target, data, value);
        revert SmartAccountHandlerUnsupportedAccount(account);
    }

    /**
     * @dev Tells whether an account is a Mimic smart account
     * @param account Address of the account being queried
     */
    function _isMimicSmartAccount(address account) internal view returns (bool) {
        try ISmartAccount(account).supportsInterface(type(ISmartAccount).interfaceId) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }
}
