// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';
import '../safeguards/Safeguards.sol';

/**
 * @title IntentsValidator
 * @dev Performs intents validations based on safeguards
 */
interface IIntentsValidator {
    /**
     * @dev Intent type unknown
     */
    error IntentsValidatorUnknownIntentType(uint8 opType);

    /**
     * @dev Validates an intent for a list of safeguards
     * @param intent Intent to be validated
     * @param safeguards Safeguards to validate the intent with
     */
    function validate(Intent memory intent, Safeguard[] memory safeguards) external pure;
}
