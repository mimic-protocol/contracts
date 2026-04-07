// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './BaseOperationsValidator.sol';
import './Safeguards.sol';
import '../Intents.sol';

/**
 * @dev Swap safeguard modes to validate swap operations
 * @param None To ensure no swaps are allowed
 * @param SourceChain To validate that the source chain is allowed
 * @param DestinationChain To validate that the destination chain is allowed
 * @param TokenIn To validate that the tokens to be sent are allowed
 * @param TokenOut To validate that the tokens to be received are allowed
 * @param Recipient To validate that the recipients that will receive the tokens are allowed
 */
enum SwapSafeguardMode {
    None,
    SourceChain,
    DestinationChain,
    TokenIn,
    TokenOut,
    Recipient
}

/**
 * @title SwapOperationsValidator
 * @dev Performs swap operations validations based on safeguards
 */
contract SwapOperationsValidator is BaseOperationsValidator {
    /**
     * @dev Tells whether a swap operation is valid for a safeguard
     * @param operation Swap operation to be validated
     * @param safeguard Safeguard to validate the operation with
     */
    function _isSwapOperationValid(Operation memory operation, Safeguard memory safeguard)
        internal
        pure
        returns (bool)
    {
        SwapOperation memory swapOperation = abi.decode(operation.data, (SwapOperation));
        if (safeguard.mode == uint8(SwapSafeguardMode.SourceChain))
            return _isChainAllowed(swapOperation.sourceChain, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.DestinationChain))
            return _isChainAllowed(swapOperation.destinationChain, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.TokenIn))
            return _areSwapTokensInValid(swapOperation.tokensIn, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.TokenOut))
            return _areSwapTokensOutValid(swapOperation.tokensOut, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.Recipient))
            return _areSwapRecipientsValid(swapOperation.tokensOut, safeguard.config);
        revert OperationsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Tells whether the tokens to be sent are allowed
     */
    function _areSwapTokensInValid(TokenIn[] memory tokensIn, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensIn.length; i++) {
            if (!_isAccountAllowed(tokensIn[i].token, config)) return false;
        }
        return true;
    }

    /**
     * @dev Tells whether the tokens to be received are allowed
     */
    function _areSwapTokensOutValid(TokenOut[] memory tokensOut, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            if (!_isAccountAllowed(tokensOut[i].token, config)) return false;
        }
        return true;
    }

    /**
     * @dev Tells whether the recipients to be received are allowed
     */
    function _areSwapRecipientsValid(TokenOut[] memory tokensOut, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            if (!_isAccountAllowed(tokensOut[i].recipient, config)) return false;
        }
        return true;
    }
}
