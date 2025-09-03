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
     * @dev Transfer intent chain ID is not allowed
     */
    error IntentsValidatorTransferChainNotAllowed(uint256 chainId);

    /**
     * @dev Transfer intent token is not allowed
     */
    error IntentsValidatorTransferTokenNotAllowed(address token);

    /**
     * @dev Transfer intent recipient is not allowed
     */
    error IntentsValidatorTransferRecipientNotAllowed(address recipient);

    /**
     * @dev Validates a transfer intent for a safeguard
     * @param intent Transfer intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _validateTransfer(Intent memory intent, Safeguard memory safeguard) internal pure {
        if (safeguard.mode == uint8(TransferSafeguardMode.None)) _validateNone();

        TransferIntent memory transferIntent = abi.decode(intent.data, (TransferIntent));
        if (safeguard.mode == uint8(TransferSafeguardMode.Chain))
            _validateTransferChain(transferIntent.chainId, safeguard.config);
        else if (safeguard.mode == uint8(TransferSafeguardMode.Token))
            _validateTransferTokens(transferIntent.transfers, safeguard.config);
        else if (safeguard.mode == uint8(TransferSafeguardMode.Recipient))
            _validateTransferRecipients(transferIntent.transfers, safeguard.config);
        else revert IntentsValidatorInvalidMode(safeguard.mode);
    }

    /**
     * @dev Validates that the transfer chain is allowed
     */
    function _validateTransferChain(uint256 chainId, bytes memory config) private pure {
        if (!_isChainAllowed(chainId, config)) revert IntentsValidatorTransferChainNotAllowed(chainId);
    }

    /**
     * @dev Validates that the tokens being transferred are allowed
     */
    function _validateTransferTokens(TransferData[] memory transfers, bytes memory config) private pure {
        for (uint256 i = 0; i < transfers.length; i++) {
            address token = transfers[i].token;
            if (!_isAccountAllowed(token, config)) revert IntentsValidatorTransferTokenNotAllowed(token);
        }
    }

    /**
     * @dev Validates that the recipients of the transfers are allowed
     */
    function _validateTransferRecipients(TransferData[] memory transfers, bytes memory config) private pure {
        for (uint256 i = 0; i < transfers.length; i++) {
            address recipient = transfers[i].recipient;
            if (!_isAccountAllowed(recipient, config)) revert IntentsValidatorTransferRecipientNotAllowed(recipient);
        }
    }
}
