// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './CallIntentsValidator.sol';
import './TransferIntentsValidator.sol';
import './Safeguards.sol';
import './SwapIntentsValidator.sol';
import '../Intents.sol';
import '../interfaces/IIntentsValidator.sol';

/**
 * @title IntentsValidator
 * @dev Performs intents validations based on safeguards
 */
contract IntentsValidator is IIntentsValidator, SwapIntentsValidator, TransferIntentsValidator, CallIntentsValidator {
    /**
     * @dev Validates an intent for a list of safeguards
     * @param intent Intent to be validated
     * @param safeguards Safeguards to validate the intent with
     */
    function validate(Intent memory intent, Safeguard[] memory safeguards) external pure override {
        for (uint256 i = 0; i < safeguards.length; i++) validate(intent, safeguards[i]);
    }

    /**
     * @dev Validates an intent for a safeguard
     * @param intent Intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function validate(Intent memory intent, Safeguard memory safeguard) internal pure {
        if (safeguard.mode == uint8(0)) _validateNone();
        if (intent.op == uint8(OpType.Swap)) _validateSwap(intent, safeguard);
        else if (intent.op == uint8(OpType.Transfer)) _validateTransfer(intent, safeguard);
        else if (intent.op == uint8(OpType.Call)) _validateCall(intent, safeguard);
        else revert IntentsValidatorUnknownIntentType(uint8(intent.op));
    }
}
