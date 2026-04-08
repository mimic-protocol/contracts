// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './CallOperationsValidator.sol';
import './Safeguards.sol';
import './BaseOperationsValidator.sol';
import '../Intents.sol';

/**
 * @title DynamicCallOperationsValidator
 * @dev Performs dynamic call operations validations based on call safeguards
 */
contract DynamicCallOperationsValidator is BaseOperationsValidator {
    /**
     * @dev Tells whether a dynamic call operation is valid for a safeguard
     * @param operation Dynamic call operation to be validated
     * @param safeguard Safeguard to validate the operation with
     */
    function _isDynamicCallOperationValid(Operation memory operation, Safeguard memory safeguard)
        internal
        pure
        returns (bool)
    {
        DynamicCallOperation memory dynamicCallOperation = abi.decode(operation.data, (DynamicCallOperation));
        if (safeguard.mode == uint8(CallSafeguardMode.Chain))
            return _isChainAllowed(dynamicCallOperation.chainId, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Target))
            return _areDynamicCallTargetsValid(dynamicCallOperation.calls, safeguard.config);
        if (safeguard.mode == uint8(CallSafeguardMode.Selector))
            return _areDynamicCallSelectorsValid(dynamicCallOperation.calls, safeguard.config);
        revert OperationsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Tells whether the dynamic call targets are allowed
     */
    function _areDynamicCallTargetsValid(bytes[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            DynamicCall memory call = abi.decode(calls[i], (DynamicCall));
            if (!_isAccountAllowed(call.target, config)) return false;
        }
        return true;
    }

    /**
     * @dev Tells whether the dynamic call selectors are allowed
     */
    function _areDynamicCallSelectorsValid(bytes[] memory calls, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < calls.length; i++) {
            DynamicCall memory call = abi.decode(calls[i], (DynamicCall));
            if (!_isSelectorAllowed(call.selector, config)) return false;
        }
        return true;
    }
}
