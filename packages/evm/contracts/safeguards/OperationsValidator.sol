// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import './CallOperationsValidator.sol';
import './TransferOperationsValidator.sol';
import './Safeguards.sol';
import './SwapOperationsValidator.sol';
import '../Intents.sol';
import '../interfaces/IOperationsValidator.sol';

/**
 * @title OperationsValidator
 * @dev Performs operations validations based on safeguards
 */
contract OperationsValidator is
    IOperationsValidator,
    SwapOperationsValidator,
    TransferOperationsValidator,
    CallOperationsValidator
{
    /**
     * @dev Safeguard validation failed
     */
    error OperationsValidatorSafeguardFailed();

    /**
     * @dev Invalid safeguard config mode
     */
    error OperationsValidatorInvalidSafeguardConfigMode(uint8 mode);

    /**
     * @dev Invalid safeguard group logic mode
     */
    error OperationsValidatorInvalidSafeguardGroupLogicMode(uint8 mode);

    /**
     * @dev Tells whether an operation is valid for a safeguard
     * @param operation Operation to be validated
     * @param config Safeguard config to validate the operation with
     */
    function validate(Operation memory operation, bytes memory config) external pure override {
        (uint8 mode, bytes memory safeguard) = abi.decode(config, (uint8, bytes));
        if (mode == uint8(SafeguardConfigMode.List)) _validate(operation, abi.decode(safeguard, (Safeguard[])));
        else if (mode == uint8(SafeguardConfigMode.Tree)) _validate(operation, _decodeSafeguardTree(safeguard));
        else revert OperationsValidatorInvalidSafeguardConfigMode(mode);
    }

    /**
     * @dev Tells whether an operation is valid for a safeguards list
     * @param operation Operation to be validated
     * @param safeguards Safeguard list to validate the operation with
     */
    function _validate(Operation memory operation, Safeguard[] memory safeguards) internal pure {
        if (safeguards.length == 0) revert OperationsValidatorSafeguardFailed();
        for (uint256 i = 0; i < safeguards.length; i++) {
            if (!_isSafeguardValid(operation, safeguards[i])) revert OperationsValidatorSafeguardFailed();
        }
    }

    /**
     * @dev Tells whether an operation is valid for a safeguard tree
     * @param operation Operation to be validated
     * @param tree Safeguard tree to validate the operation with
     */
    function _validate(Operation memory operation, SafeguardTree memory tree) internal pure {
        if (tree.nodes.length == 0) revert OperationsValidatorSafeguardFailed();
        if (!_isSafeguardGroupValid(operation, tree, 0)) revert OperationsValidatorSafeguardFailed();
    }

    /**
     * @dev Tells whether an operation is valid for a safeguard tree at a certain level
     * @param operation Operation to be validated
     * @param tree Safeguard tree to validate the operation with
     * @param index Index of the group node to evaluate
     */
    function _isSafeguardGroupValid(Operation memory operation, SafeguardTree memory tree, uint16 index)
        internal
        pure
        returns (bool)
    {
        SafeguardGroup memory group = tree.nodes[index];

        if (group.logic == uint8(SafeguardGroupLogic.NOT)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(operation, tree.leaves[group.leaves[i]])) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(operation, tree, group.children[i])) return false;
            }
            return true;
        }

        if (group.logic == uint8(SafeguardGroupLogic.AND)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (!_isSafeguardValid(operation, tree.leaves[group.leaves[i]])) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (!_isSafeguardGroupValid(operation, tree, group.children[i])) return false;
            }
            return true;
        }

        if (group.logic == uint8(SafeguardGroupLogic.OR)) {
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(operation, tree.leaves[group.leaves[i]])) return true;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(operation, tree, group.children[i])) return true;
            }
            return false;
        }

        if (group.logic == uint8(SafeguardGroupLogic.XOR)) {
            uint256 hits = 0;
            for (uint256 i = 0; i < group.leaves.length; i++) {
                if (_isSafeguardValid(operation, tree.leaves[group.leaves[i]]))
                    if (++hits > 1) return false;
            }
            for (uint256 i = 0; i < group.children.length; i++) {
                if (_isSafeguardGroupValid(operation, tree, group.children[i]))
                    if (++hits > 1) return false;
            }
            return hits == 1;
        }

        revert OperationsValidatorInvalidSafeguardGroupLogicMode(group.logic);
    }

    /**
     * @dev Tells whether an operation is valid for a safeguard
     * @param operation Operation to be validated
     * @param safeguard Safeguard to validate the operation with
     */
    function _isSafeguardValid(Operation memory operation, Safeguard memory safeguard) internal pure returns (bool) {
        if (safeguard.mode == uint8(0)) revert OperationsValidatorNoneAllowed();
        if (operation.opType == uint8(OpType.Swap)) return _isSwapOperationValid(operation, safeguard);
        if (operation.opType == uint8(OpType.Transfer)) return _isTransferOperationValid(operation, safeguard);
        if (operation.opType == uint8(OpType.Call)) return _isCallOperationValid(operation, safeguard);
        revert OperationsValidatorUnknownOperationType(uint8(operation.opType));
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
