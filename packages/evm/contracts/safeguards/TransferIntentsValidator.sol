// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './BaseIntentsValidator.sol';
import './Safeguards.sol';
import '../Intents.sol';

/**
 * @dev Transfer safeguard modes to validate transfer intents
 * @param None To ensure no transfers are allowed
 * @param Chain To validate that the chain where transfers execute is allowed
 * @param Token To validate that the tokens being transferred are allowed
 * @param Recipient To validate that the recipients of the transfers are allowed
 */
enum TransferSafeguardMode {
    None,
    Chain,
    Token,
    Recipient
}

/**
 * @title TransferIntentsValidator
 * @dev Performs transfer intents validations based on safeguards
 */
contract TransferIntentsValidator is BaseIntentsValidator {
    /**
     * @dev Validates a transfer intent for a safeguard
     * @param intent Transfer intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _isTransferIntentValid(Intent memory intent, Safeguard memory safeguard) internal pure returns (bool) {
        TransferIntent memory transferIntent = abi.decode(intent.data, (TransferIntent));
        if (safeguard.mode == uint8(TransferSafeguardMode.Chain))
            return _isChainAllowed(transferIntent.chainId, safeguard.config);
        else if (safeguard.mode == uint8(TransferSafeguardMode.Token))
            return _areTransferTokensValid(transferIntent.transfers, safeguard.config);
        else if (safeguard.mode == uint8(TransferSafeguardMode.Recipient))
            return _areTransferRecipientsValid(transferIntent.transfers, safeguard.config);
        else revert IntentsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Validates that the tokens being transferred are allowed
     */
    function _areTransferTokensValid(TransferData[] memory transfers, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < transfers.length; i++) if (!_isAccountAllowed(transfers[i].token, config)) return false;
        return true;
    }

    /**
     * @dev Validates that the recipients of the transfers are allowed
     */
    function _areTransferRecipientsValid(TransferData[] memory transfers, bytes memory config)
        private
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < transfers.length; i++)
            if (!_isAccountAllowed(transfers[i].recipient, config)) return false;
        return true;
    }
}
