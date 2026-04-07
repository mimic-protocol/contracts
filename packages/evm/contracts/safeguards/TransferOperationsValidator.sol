// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './BaseOperationsValidator.sol';
import './Safeguards.sol';
import '../Intents.sol';

/**
 * @dev Transfer safeguard modes to validate transfer operations
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
 * @title TransferOperationsValidator
 * @dev Performs transfer operations validations based on safeguards
 */
contract TransferOperationsValidator is BaseOperationsValidator {
    /**
     * @dev Tells whether a transfer operation is valid for a safeguard
     * @param operation Transfer operation to be validated
     * @param safeguard Safeguard to validate the operation with
     */
    function _isTransferOperationValid(Operation memory operation, Safeguard memory safeguard)
        internal
        pure
        returns (bool)
    {
        TransferOperation memory transferOperation = abi.decode(operation.data, (TransferOperation));
        if (safeguard.mode == uint8(TransferSafeguardMode.Chain))
            return _isChainAllowed(transferOperation.chainId, safeguard.config);
        if (safeguard.mode == uint8(TransferSafeguardMode.Token))
            return _areTransferTokensValid(transferOperation.transfers, safeguard.config);
        if (safeguard.mode == uint8(TransferSafeguardMode.Recipient))
            return _areTransferRecipientsValid(transferOperation.transfers, safeguard.config);
        revert OperationsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Tells whether the tokens being transferred are allowed
     */
    function _areTransferTokensValid(TransferData[] memory transfers, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < transfers.length; i++) {
            if (!_isAccountAllowed(transfers[i].token, config)) return false;
        }
        return true;
    }

    /**
     * @dev Tells whether the recipients of the transfers are allowed
     */
    function _areTransferRecipientsValid(TransferData[] memory transfers, bytes memory config)
        private
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < transfers.length; i++) {
            if (!_isAccountAllowed(transfers[i].recipient, config)) return false;
        }
        return true;
    }
}
