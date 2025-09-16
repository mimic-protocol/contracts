// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './Safeguards.sol';
import './BaseIntentsValidator.sol';
import '../Intents.sol';

/**
 * @dev Call safeguard modes to validate call intents
 * @param None To ensure no calls are allowed
 * @param Chain To validate that the chain where calls execute is allowed
 * @param Target To validate that the call targets (contract addresses) are allowed
 * @param Selector To validate that the function selectors being called are allowed
 */
enum CallSafeguardMode {
    None,
    Chain,
    Target,
    Selector
}

/**
 * @title CallIntentsValidator
 * @dev Performs call intents validations based on safeguards
 */
contract CallIntentsValidator is BaseIntentsValidator {
    /**
     * @dev Validates a transfer intent for a safeguard
     * @param intent Call intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _isCallIntentValid(Intent memory intent, Safeguard memory safeguard) internal pure returns (bool) {
        CallIntent memory callIntent = abi.decode(intent.data, (CallIntent));
        if (safeguard.mode == uint8(CallSafeguardMode.Chain))
            return _isChainAllowed(callIntent.chainId, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Target))
            return _areCallTargetsValid(callIntent.calls, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Selector))
            return _areCallSelectorsValid(callIntent.calls, safeguard.config);
        revert IntentsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Validates that the call targets are allowed
     */
    function _areCallTargetsValid(CallData[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            if (!_isAccountAllowed(calls[i].target, config)) return false;
        }
        return true;
    }

    /**
     * @dev Validates that the function selectors are allowed
     */
    function _areCallSelectorsValid(CallData[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            if (!_isSelectorAllowed(bytes4(calls[i].data), config)) return false;
        }
        return true;
    }
}
