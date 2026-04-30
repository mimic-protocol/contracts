// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../../smart-accounts/SmartAccountsHandlerHelpers.sol';

contract SmartAccountsHandlerHelpersMock {
    using SmartAccountsHandlerHelpers for address;

    function call(address handler, address account, address target, bytes memory data, uint256 value)
        external
        returns (bytes memory)
    {
        // solhint-disable-next-line avoid-low-level-calls
        return handler.call(account, target, data, value);
    }
}
