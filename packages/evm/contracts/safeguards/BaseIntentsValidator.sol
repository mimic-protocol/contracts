// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './Safeguards.sol';
import '../Intents.sol';

/**
 * @title BaseIntentsValidator
 */
contract BaseIntentsValidator {
    /**
     * @dev No intents allowed
     */
    error IntentsValidatorNoneAllowed();

    /**
     * @dev Invalid safeguard mode set
     */
    error IntentsValidatorInvalidMode(uint8 mode);

    /**
     * @dev Validates no intents are allowed
     */
    function _validateNone() internal pure {
        revert IntentsValidatorNoneAllowed();
    }

    /**
     * @dev Tells whether a chain is allowed
     */
    function _isChainAllowed(uint256 chainId, bytes memory config) internal pure returns (bool) {
        (bool isDenyList, uint256[] memory values) = abi.decode(config, (bool, uint256[]));
        if (isDenyList) {
            for (uint256 i = 0; i < values.length; i++) {
                if (chainId == values[i]) return false;
            }
            return true;
        } else {
            for (uint256 i = 0; i < values.length; i++) {
                if (chainId == values[i]) return true;
            }
            return false;
        }
    }

    /**
     * @dev Tells whether an account is allowed
     */
    function _isAccountAllowed(address account, bytes memory config) internal pure returns (bool) {
        (bool isDenyList, address[] memory values) = abi.decode(config, (bool, address[]));
        if (isDenyList) {
            for (uint256 i = 0; i < values.length; i++) {
                if (account == values[i]) return false;
            }
            return true;
        } else {
            for (uint256 i = 0; i < values.length; i++) {
                if (account == values[i]) return true;
            }
            return false;
        }
    }

    /**
     * @dev Tells whether a selector is allowed
     */
    function _isSelectorAllowed(bytes4 selector, bytes memory config) internal pure returns (bool) {
        (bool isDenyList, bytes4[] memory values) = abi.decode(config, (bool, bytes4[]));
        if (isDenyList) {
            for (uint256 i = 0; i < values.length; i++) {
                if (selector == values[i]) return false;
            }
            return true;
        } else {
            for (uint256 i = 0; i < values.length; i++) {
                if (selector == values[i]) return true;
            }
            return false;
        }
    }
}
