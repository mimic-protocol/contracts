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

import '../interfaces/ISmartAccountHandler.sol';

library SmartAccountHandlerHelpers {
    /**
     * @dev Tells whether an account is a supported smart account
     * @param account Address of the account being queried
     */
    function isSmartAccount(address handler, address account) internal view returns (bool) {
        return ISmartAccountHandler(handler).isSmartAccount(account);
    }

    /**
     * @dev Performs a transfer from a smart account
     */
    function transfer(address handler, address account, address token, address to, uint256 amount) internal {
        Address.functionDelegateCall(
            handler,
            abi.encodeWithSelector(ISmartAccountHandler.transfer.selector, account, token, to, amount)
        );
    }

    /**
     * @dev Performs a call from a smart account
     */
    function call(address handler, address account, address target, bytes memory data, uint256 value)
        internal
        returns (bytes memory)
    {
        return
            Address.functionDelegateCall(
                handler,
                abi.encodeWithSelector(ISmartAccountHandler.call.selector, account, target, data, value)
            );
    }
}
