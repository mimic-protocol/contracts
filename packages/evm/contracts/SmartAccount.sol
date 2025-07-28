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
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';

import './interfaces/ISmartAccount.sol';
import './utils/ERC20Helpers.sol';

/**
 * @title SmartAccount
 * @dev Provides the logic for managing assets, executing arbitrary calls, and controlling permissions
 */
contract SmartAccount is ISmartAccount, ERC165, Ownable, ReentrancyGuard {
    // EIP1271 magic return value
    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    // EIP1271 invalid signature return value
    bytes4 internal constant EIP1271_INVALID_SIGNATURE = 0xffffffff;

    // List of account permissions
    mapping (address => bool) public isSignerAllowed;

    // Mimic settler reference
    address public settler;

    /**
     * @dev The settler is zero
     */
    error SmartAccountSettlerZero();

    /**
     * @dev The input arrays are not of equal length
     */
    error SmartAccountInputInvalidLength();

    /**
     * @dev The sender is not the owner or the settler
     */
    error SmartAccountUnauthorizedSender(address sender);

    /**
     * @dev Emitted every time the settler is set
     */
    event SettlerSet(address indexed settler);

    /**
     * @dev Emitted every time a signer allowance is set
     */
    event SignerAllowedSet(address indexed account, bool allowed);

    /**
     * @dev Reverts unless the sender is the owner or the settler
     */
    modifier onlyOwnerOrSettler() {
        address sender = _msgSender();
        bool isAuthorized = sender == owner() || sender == settler;
        if (!isAuthorized) revert SmartAccountUnauthorizedSender(sender);
        _;
    }

    /**
     * @dev Creates a new SmartAccount contract
     * @param _settler Address of the Mimic settler
     * @param _owner Address that will own the contract
     */
    constructor(address _settler, address _owner) Ownable(_owner) {
        _setSettler(_settler);
    }

    /**
     * @dev Tells whether the contract supports the given interface ID. Overrides ERC165 to declare support for ISmartAccount interface.
     * @param interfaceId Interface ID is defined as the XOR of all function selectors in the interface
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
        return interfaceId == type(ISmartAccount).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Tells whether the signature provided belongs to an allowed account.
     * @param hash Message signed by the account
     * @param signature Signature provided to be verified
     */
    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        (address signer, , ) = ECDSA.tryRecover(hash, signature);
        if (signer != address(0) && (signer == owner() || isSignerAllowed[signer])) return EIP1271_MAGIC_VALUE;
        return EIP1271_INVALID_SIGNATURE;
    }

    /**
     * @dev It allows receiving native token transfers
     */
    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @dev Transfers ERC20 or native tokens to the recipient. Sender must be the owner or the settler.
     * @param token Address of the token to be withdrawn
     * @param recipient Address of the account receiving the tokens
     * @param amount Amount of tokens to be withdrawn
     */
    function transfer(address token, address recipient, uint256 amount)
        external
        override
        onlyOwnerOrSettler
        nonReentrant
    {
        ERC20Helpers.transfer(token, recipient, amount);
        emit Transferred(token, recipient, amount);
    }

    /**
     * @dev Executes an arbitrary call from the contract. Sender must be the owner or the settler.
     * @param target Address where the call will be sent
     * @param data Calldata to be sent to the target
     * @param value Native token value to send along with the call
     * @return result Call response if it was successful, otherwise it reverts
     */
    function call(address target, bytes memory data, uint256 value)
        external
        override
        onlyOwnerOrSettler
        nonReentrant
        returns (bytes memory result)
    {
        result = Address.functionCallWithValue(target, data, value);
        emit Called(target, data, value, result);
    }

    /**
     * @dev Sets the settler. Sender must be the owner.
     * @param newSettler Address of the new settler to be set
     */
    function setSettler(address newSettler) external onlyOwner {
        _setSettler(newSettler);
    }

    /**
     * @dev Sets a list of allowed signers. Sender must be the owner.
     * @param accounts List of account addresses
     * @param allowances List of allowed condition per account
     */
    function setAllowedSigners(address[] memory accounts, bool[] memory allowances) external onlyOwner {
        if (accounts.length != allowances.length) revert SmartAccountInputInvalidLength();
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            bool allowed = allowances[i];
            isSignerAllowed[account] = allowed;
            emit SignerAllowedSet(account, allowed);
        }
    }

    /**
     * @dev Sets the settler
     * @param newSettler Address of the new settler to be set
     */
    function _setSettler(address newSettler) internal {
        if (newSettler == address(0)) revert SmartAccountSettlerZero();
        settler = newSettler;
        emit SettlerSet(newSettler);
    }
}
