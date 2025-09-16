// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './BaseIntentsValidator.sol';
import './Safeguards.sol';
import '../Intents.sol';

/**
 * @dev Swap safeguard modes to validate swap intents
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
 * @title SwapIntentsValidator
 * @dev Performs swap intents validations based on safeguards
 */
contract SwapIntentsValidator is BaseIntentsValidator {
    /**
     * @dev Validates a swap intent for a safeguard
     * @param intent Swap intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _isSwapIntentValid(Intent memory intent, Safeguard memory safeguard) internal pure returns (bool) {
        SwapIntent memory swapIntent = abi.decode(intent.data, (SwapIntent));
        if (safeguard.mode == uint8(SwapSafeguardMode.SourceChain))
            return _isChainAllowed(swapIntent.sourceChain, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.DestinationChain))
            return _isChainAllowed(swapIntent.destinationChain, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.TokenIn))
            return _areSwapTokensInValid(swapIntent.tokensIn, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.TokenOut))
            return _areSwapTokensOutValid(swapIntent.tokensOut, safeguard.config);
        if (safeguard.mode == uint8(SwapSafeguardMode.Recipient))
            return _areSwapRecipientsValid(swapIntent.tokensOut, safeguard.config);
        revert IntentsValidatorInvalidSafeguardMode(safeguard.mode);
    }

    /**
     * @dev Validates that the tokens to be sent are allowed
     */
    function _areSwapTokensInValid(TokenIn[] memory tokensIn, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensIn.length; i++) {
            if (!_isAccountAllowed(tokensIn[i].token, config)) return false;
        }
        return true;
    }

    /**
     * @dev Validates that the tokens to be received are allowed
     */
    function _areSwapTokensOutValid(TokenOut[] memory tokensOut, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            if (!_isAccountAllowed(tokensOut[i].token, config)) return false;
        }
        return true;
    }

    /**
     * @dev Validates that the recipients to be received are allowed
     */
    function _areSwapRecipientsValid(TokenOut[] memory tokensOut, bytes memory config) private pure returns (bool) {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            if (!_isAccountAllowed(tokensOut[i].recipient, config)) return false;
        }
        return true;
    }
}
