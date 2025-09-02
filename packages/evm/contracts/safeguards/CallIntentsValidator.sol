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
 * @param Method To validate that the function selectors being called are allowed
 */
enum CallSafeguardMode {
    None,
    Chain,
    Target,
    Method
}

/**
 * @title CallIntentsValidator
 * @dev Performs call intents validations based on safeguards
 */
contract CallIntentsValidator is BaseIntentsValidator {
    /**
     * @dev Call intent chain ID is not allowed
     */
    error IntentsValidatorCallChainNotAllowed(uint256 chainId);

    /**
     * @dev Call intent target contract is not allowed
     */
    error IntentsValidatorCallTargetNotAllowed(address target);

    /**
     * @dev Call intent function selector is not allowed
     */
    error IntentsValidatorCallMethodNotAllowed(bytes4 selector);

    /**
     * @dev Call intent ETH value is not allowed
     */
    error IntentsValidatorCallValueNotAllowed(uint256 value);

    /**
     * @dev Validates a transfer intent for a safeguard
     * @param intent Call intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _validateCall(Intent memory intent, Safeguard memory safeguard) internal pure {
        if (safeguard.mode == uint8(CallSafeguardMode.None)) _validateNone();

        CallIntent memory callIntent = abi.decode(intent.data, (CallIntent));
        if (safeguard.mode == uint8(CallSafeguardMode.Chain)) _validateCallChain(callIntent.chainId, safeguard.config);
        else if (safeguard.mode == uint8(CallSafeguardMode.Target))
            _validateCallTargets(callIntent.calls, safeguard.config);
        else if (safeguard.mode == uint8(CallSafeguardMode.Method))
            _validateCallMethods(callIntent.calls, safeguard.config);
        else revert IntentsValidatorInvalidMode(safeguard.mode);
    }

    /**
     * @dev Validates that the call chain is allowed
     */
    function _validateCallChain(uint256 chainId, bytes memory config) private pure {
        if (!_isChainAllowed(chainId, config)) revert IntentsValidatorCallChainNotAllowed(chainId);
    }

    /**
     * @dev Validates that the call targets are allowed
     */
    function _validateCallTargets(CallData[] memory calls, bytes memory config) private pure {
        for (uint256 i = 0; i < calls.length; i++) {
            address target = calls[i].target;
            if (!_isAccountAllowed(target, config)) revert IntentsValidatorCallTargetNotAllowed(target);
        }
    }

    /**
     * @dev Validates that the function selectors are allowed
     */
    function _validateCallMethods(CallData[] memory calls, bytes memory config) private pure {
        for (uint256 i = 0; i < calls.length; i++) {
            bytes4 selector = bytes4(calls[i].data);
            if (!_isSelectorAllowed(selector, config)) revert IntentsValidatorCallMethodNotAllowed(selector);
        }
    }
}
