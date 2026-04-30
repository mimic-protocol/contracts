// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import '../Intents.sol';
import '../safeguards/Safeguards.sol';

/**
 * @title OperationsValidator
 * @dev Performs operations validations based on safeguards
 */
interface IOperationsValidator {
    /**
     * @dev Validates an operation for a safeguard
     * @param operation Operation to be validated
     * @param config Safeguard config to validate the operation with
     */
    function validate(Operation memory operation, bytes memory config) external pure;
}
