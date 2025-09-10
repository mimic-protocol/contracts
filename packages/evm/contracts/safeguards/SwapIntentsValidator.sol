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
     * @dev Swap intent source chain is not allowed
     */
    error IntentsValidatorSwapSourceChainNotAllowed(uint256 sourceChain);

    /**
     * @dev Swap intent destination chain is not allowed
     */
    error IntentsValidatorSwapDestinationChainNotAllowed(uint256 destinationChain);

    /**
     * @dev Swap intent token in is not allowed
     */
    error IntentsValidatorSwapTokenInNotAllowed(address tokenIn);

    /**
     * @dev Swap intent token out is not allowed
     */
    error IntentsValidatorSwapTokenOutNotAllowed(address tokenOut);

    /**
     * @dev Swap intent recipient is not allowed
     */
    error IntentsValidatorSwapRecipientNotAllowed(address recipient);

    /**
     * @dev Validates a swap intent for a safeguard
     * @param intent Swap intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _validateSwap(Intent memory intent, Safeguard memory safeguard) internal pure {
        SwapIntent memory swapIntent = abi.decode(intent.data, (SwapIntent));
        if (safeguard.mode == uint8(SwapSafeguardMode.SourceChain))
            _validateSwapSourceChain(swapIntent.sourceChain, safeguard.config);
        else if (safeguard.mode == uint8(SwapSafeguardMode.DestinationChain))
            _validateSwapDestinationChain(swapIntent.destinationChain, safeguard.config);
        else if (safeguard.mode == uint8(SwapSafeguardMode.TokenIn))
            _validateSwapTokensIn(swapIntent.tokensIn, safeguard.config);
        else if (safeguard.mode == uint8(SwapSafeguardMode.TokenOut))
            _validateSwapTokensOut(swapIntent.tokensOut, safeguard.config);
        else if (safeguard.mode == uint8(SwapSafeguardMode.Recipient))
            _validateSwapRecipients(swapIntent.tokensOut, safeguard.config);
        else revert IntentsValidatorInvalidMode(safeguard.mode);
    }

    /**
     * @dev Validates that the source chain is allowed
     */
    function _validateSwapSourceChain(uint256 chain, bytes memory config) private pure {
        if (!_isChainAllowed(chain, config)) revert IntentsValidatorSwapSourceChainNotAllowed(chain);
    }

    /**
     * @dev Validates that the destination chain is allowed
     */
    function _validateSwapDestinationChain(uint256 chain, bytes memory config) private pure {
        if (!_isChainAllowed(chain, config)) revert IntentsValidatorSwapDestinationChainNotAllowed(chain);
    }

    /**
     * @dev Validates that the tokens to be sent are allowed
     */
    function _validateSwapTokensIn(TokenIn[] memory tokensIn, bytes memory config) private pure {
        for (uint256 i = 0; i < tokensIn.length; i++) {
            address token = tokensIn[i].token;
            if (!_isAccountAllowed(token, config)) revert IntentsValidatorSwapTokenInNotAllowed(token);
        }
    }

    /**
     * @dev Validates that the tokens to be received are allowed
     */
    function _validateSwapTokensOut(TokenOut[] memory tokensOut, bytes memory config) private pure {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            address token = tokensOut[i].token;
            if (!_isAccountAllowed(token, config)) revert IntentsValidatorSwapTokenOutNotAllowed(token);
        }
    }

    /**
     * @dev Validates that the recipients to be received are allowed
     */
    function _validateSwapRecipients(TokenOut[] memory tokensOut, bytes memory config) private pure {
        for (uint256 i = 0; i < tokensOut.length; i++) {
            address recipient = tokensOut[i].recipient;
            if (!_isAccountAllowed(recipient, config)) revert IntentsValidatorSwapRecipientNotAllowed(recipient);
        }
    }
}
