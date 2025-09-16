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
     * @dev Safeguard validation failed
     */
    error IntentsValidatorSafeguardFailed();

    /**
     * @dev Invalid safeguard config mode
     */
    error IntentsValidatorInvalidSafeguardConfigMode(uint8 mode);

    /**
     * @dev Invalid safeguard group logic mode
     */
    error IntentsValidatorInvalidSafeguardGroupLogicMode(uint8 mode);

    /**
     * @dev Validates an intent for a safeguard
     * @param intent Intent to be validated
     * @param config Safeguard config to validate the intent with
     */
    function validate(Intent memory intent, bytes memory config) external pure override {
        (uint8 mode, bytes memory safeguard) = abi.decode(config, (uint8, bytes));
        if (mode == uint8(SafeguardConfigMode.List)) _validate(intent, abi.decode(safeguard, (Safeguard[])));
        if (mode == uint8(SafeguardConfigMode.Tree)) _validate(intent, _decodeSafeguardTree(safeguard));
        revert IntentsValidatorInvalidSafeguardConfigMode(mode);
    }

    /**
     * @dev Validates an intent for a safeguard
     * @param intent Intent to be validated
     * @param safeguards Safeguard list to validate the intent with
     */
    function _validate(Intent memory intent, Safeguard[] memory safeguards) internal pure {
        if (safeguards.length == 0) revert IntentsValidatorSafeguardFailed();
        for (uint256 i = 0; i < safeguards.length; i++) {
            if (!_isSafeguardValid(intent, safeguards[i])) revert IntentsValidatorSafeguardFailed();
        }
    }

    /**
     * @dev Validates an intent for a safeguard
     * @param intent Intent to be validated
     * @param tree Safeguard tree to validate the intent with
     */
    function _validate(Intent memory intent, SafeguardTree memory tree) internal pure {
        if (tree.nodes.length == 0) revert IntentsValidatorSafeguardFailed();
        if (!_isSafeguardGroupValid(intent, tree, 0)) revert IntentsValidatorSafeguardFailed();
    }

    /**
     * @dev Tells whether an intent is valid for a safeguard tree
     * @param intent Intent to be validated
     * @param tree Safeguard tree to validate the intent with
     * @param index Index of the group node to evaluate
     */
    function _isSafeguardGroupValid(Intent memory intent, SafeguardTree memory tree, uint16 index)
        internal
        pure
        returns (bool)
    {
        SafeguardGroup memory group = tree.nodes[index];

        if (group.logic == uint8(SafeguardGroupLogic.NOT)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(intent, tree.leaves[group.leaves[i]])) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(intent, tree, group.children[i])) return false;
            }
            return true;
        }

        if (group.logic == uint8(SafeguardGroupLogic.AND)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (!_isSafeguardValid(intent, tree.leaves[group.leaves[i]])) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (!_isSafeguardGroupValid(intent, tree, group.children[i])) return false;
            }
            return true;
        }

        if (group.logic == uint8(SafeguardGroupLogic.OR)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(intent, tree.leaves[group.leaves[i]])) return true;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(intent, tree, group.children[i])) return true;
            }
            return false;
        }

        if (group.logic == uint8(SafeguardGroupLogic.XOR)) {
            uint256 hits = 0;
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(intent, tree.leaves[group.leaves[i]]))
                    if (++hits > 1) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(intent, tree, group.children[i]))
                    if (++hits > 1) return false;
            }
            return hits == 1;
        }

        revert IntentsValidatorInvalidSafeguardGroupLogicMode(group.logic);
    }

    /**
     * @dev Tells whether an intent is valid for a safeguard
     * @param intent Intent to be validated
     * @param safeguard Safeguard to validate the intent with
     */
    function _isSafeguardValid(Intent memory intent, Safeguard memory safeguard) internal pure returns (bool) {
        if (safeguard.mode == uint8(0)) revert IntentsValidatorNoneAllowed();
        if (intent.op == uint8(OpType.Swap)) return _isSwapIntentValid(intent, safeguard);
        if (intent.op == uint8(OpType.Transfer)) return _isTransferIntentValid(intent, safeguard);
        if (intent.op == uint8(OpType.Call)) return _isCallIntentValid(intent, safeguard);
        revert IntentsValidatorUnknownIntentType(uint8(intent.op));
    }

    /**
     * @dev Safely decodes a safeguard tree avoiding compiler issues with dynamic arrays
     * @param data Safeguard tree data to be decoded
     */
    function _decodeSafeguardTree(bytes memory data) private pure returns (SafeguardTree memory) {
        (SafeguardGroup[] memory nodes, Safeguard[] memory leaves) = abi.decode(data, (SafeguardGroup[], Safeguard[]));
        return SafeguardTree(nodes, leaves);
    }
}
