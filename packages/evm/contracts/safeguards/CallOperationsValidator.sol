// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './Safeguards.sol';
import './BaseOperationsValidator.sol';
import '../Intents.sol';

/**
 * @dev Call safeguard modes to validate call operations
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
 * @title CallOperationsValidator
 * @dev Performs call operations validations based on safeguards
 */
contract CallOperationsValidator is BaseOperationsValidator {
    /**
     * @dev Tells whether a call operation is valid for a safeguard
     * @param operation Call operation to be validated
     * @param safeguard Safeguard to validate the operation with
     */
    function _isCallOperationValid(Operation memory operation, Safeguard memory safeguard)
        internal
        pure
        returns (bool)
    {
        CallOperation memory callOperation = abi.decode(operation.data, (CallOperation));
        if (safeguard.mode == uint8(CallSafeguardMode.Chain))
            return _isChainAllowed(callOperation.chainId, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Target))
            return _areCallTargetsValid(callOperation.calls, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Selector))
            return _areCallSelectorsValid(callOperation.calls, safeguard.config);
        revert OperationsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Tells whether the call targets are allowed
     */
    function _areCallTargetsValid(CallData[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            if (!_isAccountAllowed(calls[i].target, config)) return false;
        }
        return true;
    }

    /**
     * @dev Tells whether the call selectors are allowed
     */
    function _areCallSelectorsValid(CallData[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            if (!_isSelectorAllowed(bytes4(calls[i].data), config)) return false;
        }
        return true;
    }
}
