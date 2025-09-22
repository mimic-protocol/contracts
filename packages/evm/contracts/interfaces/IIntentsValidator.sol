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
     * @dev Validates an intent for a safeguard
     * @param intent Intent to be validated
     * @param config Safeguard config to validate the intent with
     */
    function validate(Intent memory intent, bytes memory config) external pure;
}
