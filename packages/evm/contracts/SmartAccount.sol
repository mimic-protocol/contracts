// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';

import './interfaces/IPermissionOracle.sol';
import './interfaces/ISmartAccount.sol';
import './utils/ERC20Helpers.sol';

/**
 * @title SmartAccount
 * @dev Provides the logic for managing assets, executing arbitrary calls, and controlling permissions
 */
contract SmartAccount is ISmartAccount, ERC165, Ownable, ReentrancyGuard {
    // Constant used to denote that an account is not allowed
    address internal constant NO_PERMISSION = address(0x0000000000000000000000000000000000000000);

    // Constant used to denote that an account is allowed to do anything
    address internal constant ANY_PERMISSION = address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    // List of account permissions
    mapping (address => address) internal _permissions;

    // Mimic settler reference
    address public settler;

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
     * @dev Tells whether an account is allowed. Intended to be used by the Mimic registry to verify if
     * an account is permitted to perform certain actions.
     * @param account Address of the account being queried
     * @param data Data representing the specific action to be validated, only used for oracles
     */
    function hasPermission(address account, bytes memory data) external view returns (bool) {
        if (account == owner()) return true;

        address permission = _permissions[account];
        if (permission == NO_PERMISSION) return false;
        if (permission == ANY_PERMISSION) return true;
        return IPermissionOracle(permission).hasPermission(account, data);
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
     * @dev Sets permissions for multiple accounts. Sender must be the owner.
     * @param accounts List of account addresses
     * @param permissions List of permission addresses
     */
    function setPermissions(address[] memory accounts, address[] memory permissions) external onlyOwner {
        if (accounts.length != permissions.length) revert SmartAccountInputInvalidLength();
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            address permission = permissions[i];
            _permissions[account] = permission;
            emit PermissionSet(account, permission);
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
