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

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IPaymentsReceiver.sol';

/**
 * @title PaymentsReceiver
 * @dev Receives ERC20 deposits and lets the owner withdraw them
 */
contract PaymentsReceiver is IPaymentsReceiver, Ownable {
    using SafeERC20 for IERC20;

    // List of allowed tokens
    mapping (address => bool) public override isTokenAllowed;

    /**
     * @dev Creates a new PaymentsReceiver contract
     * @param owner Address that will own the contract
     * @param tokens List of allowed tokens
     */
    constructor(address owner, address[] memory tokens) Ownable(owner) {
        for (uint256 i = 0; i < tokens.length; i++) _setAllowedToken(tokens[i], true);
    }

    /**
     * @dev Sets permissions for multiple tokens
     * @param tokens List of token addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedTokens(address[] memory tokens, bool[] memory alloweds) external override onlyOwner {
        if (tokens.length != alloweds.length) revert PaymentsReceiverInputInvalidLength();
        for (uint256 i = 0; i < tokens.length; i++) _setAllowedToken(tokens[i], alloweds[i]);
    }

    /**
     * @dev Deposits ERC20 tokens into the contract
     * @param token Address of the token to deposit
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external override {
        _deposit(token, _msgSender(), amount);
    }

    /**
     * @dev Deposits ERC20 tokens on behalf of a user
     * @param token Address of the token to deposit
     * @param user Address to attribute the deposit to
     * @param amount Amount to deposit
     */
    function depositOnBehalf(address token, address user, uint256 amount) external override {
        if (user == address(0)) revert PaymentsReceiverUserZero();
        _deposit(token, user, amount);
    }

    /**
     * @dev Withdraws ERC20 tokens to a recipient
     * @param token Address of the token to withdraw
     * @param recipient Address of the recipient
     * @param amount Amount to withdraw
     */
    function withdraw(address token, address recipient, uint256 amount) external override onlyOwner {
        if (token == address(0)) revert PaymentsReceiverTokenZero();
        if (recipient == address(0)) revert PaymentsReceiverRecipientZero();
        if (amount == 0) revert PaymentsReceiverAmountZero();

        IERC20(token).safeTransfer(recipient, amount);

        emit Withdrawn(token, recipient, amount);
    }

    /**
     * @dev Deposits ERC20 tokens into the contract
     * @param token Address of the token to deposit
     * @param user Address to attribute the deposit to
     * @param amount Amount to deposit
     */
    function _deposit(address token, address user, uint256 amount) internal {
        if (token == address(0)) revert PaymentsReceiverTokenZero();
        if (amount == 0) revert PaymentsReceiverAmountZero();
        if (!isTokenAllowed[token]) revert PaymentsReceiverTokenNotAllowed(token);

        address depositor = _msgSender();
        IERC20(token).safeTransferFrom(depositor, address(this), amount);

        emit Deposited(token, depositor, user, amount);
    }

    /**
     * @dev Sets a token permission
     */
    function _setAllowedToken(address token, bool allowed) internal {
        isTokenAllowed[token] = allowed;
        emit TokenAllowedSet(token, allowed);
    }
}
