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

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/ISafe.sol';
import '../interfaces/ISmartAccount.sol';
import '../interfaces/ISmartAccountsHandler.sol';
import '../utils/Denominations.sol';

contract SmartAccountsHandler is ISmartAccountsHandler {
    /**
     * @dev Tells whether an account is a supported smart account
     * @param account Address of the account being queried
     */
    function isSmartAccount(address account) external view override returns (bool) {
        if (account.code.length == 0) return false;
        if (_isMimicSmartAccount(account)) return true;
        if (_isSafe(account)) return true;
        return false;
    }

    /**
     * @dev Performs a transfer from a smart account
     */
    function transfer(address account, address token, address to, uint256 amount) external override {
        if (_isMimicSmartAccount(account)) return ISmartAccount(account).transfer(token, to, amount);
        if (_isSafe(account)) return _transferSafe(account, token, to, amount);
        revert SmartAccountsHandlerUnsupportedAccount(account);
    }

    /**
     * @dev Performs a call from a smart account
     */
    function call(address account, address target, bytes memory data, uint256 value)
        external
        override
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        if (_isMimicSmartAccount(account)) return ISmartAccount(account).call(target, data, value);
        if (_isSafe(account)) return _callSafe(account, target, data, value);
        revert SmartAccountsHandlerUnsupportedAccount(account);
    }

    /**
     * @dev Performs a transfer from a safe
     */
    function _transferSafe(address account, address token, address to, uint256 amount) internal {
        Denominations.isNativeToken(token)
            ? _callSafe(account, to, new bytes(0), amount)
            : _callSafe(account, token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount), 0);
    }

    /**
     * @dev Performs a call from a safe
     */
    function _callSafe(address account, address target, bytes memory data, uint256 value)
        internal
        returns (bytes memory)
    {
        (bool success, bytes memory result) = ISafe(account).execTransactionFromModuleReturnData(
            target,
            value,
            data,
            SafeOperation.Call
        );
        return
            data.length == 0
                ? Address.verifyCallResult(success, result)
                : Address.verifyCallResultFromTarget(target, success, result);
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

    /**
     * @dev Tells whether an account is a Gnosis Safe
     * @param account Address of the account being queried
     */
    function _isSafe(address account) internal view returns (bool) {
        try ISafe(account).getThreshold() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }
}
