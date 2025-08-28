// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IController.sol';

/**
 * @title Controller
 * @dev Manages allow lists for solvers, executors, proposal signers and validators
 */
contract Controller is IController, Ownable {
    // List of allowed solvers
    mapping (address => bool) public override isSolverAllowed;

    // List of allowed executors
    mapping (address => bool) public override isExecutorAllowed;

    // List of allowed proposal signers
    mapping (address => bool) public override isProposalSignerAllowed;

    // List of allowed validators
    mapping (address => bool) public override isValidatorAllowed;

    /**
     * @dev Creates a new Controller contract
     * @param owner Address that will own the contract
     * @param solvers List of allowed solvers
     * @param executors List of allowed executors
     * @param proposalSigners List of allowed proposal signers
     * @param validators List of allowed validators
     */
    constructor(
        address owner,
        address[] memory solvers,
        address[] memory executors,
        address[] memory proposalSigners,
        address[] memory validators
    ) Ownable(owner) {
        for (uint256 i = 0; i < solvers.length; i++) _setAllowedSolver(solvers[i], true);
        for (uint256 i = 0; i < executors.length; i++) _setAllowedExecutor(executors[i], true);
        for (uint256 i = 0; i < proposalSigners.length; i++) _setAllowedProposalSigner(proposalSigners[i], true);
        for (uint256 i = 0; i < validators.length; i++) _setAllowedValidator(validators[i], true);
    }

    /**
     * @dev Sets permissions for multiple solvers
     * @param solvers List of solver addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedSolvers(address[] memory solvers, bool[] memory alloweds) external override onlyOwner {
        if (solvers.length != alloweds.length) revert ControllerInputInvalidLength();
        for (uint256 i = 0; i < solvers.length; i++) _setAllowedSolver(solvers[i], alloweds[i]);
    }

    /**
     * @dev Sets permissions for multiple executors
     * @param executors List of executor addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedExecutors(address[] memory executors, bool[] memory alloweds) external override onlyOwner {
        if (executors.length != alloweds.length) revert ControllerInputInvalidLength();
        for (uint256 i = 0; i < executors.length; i++) _setAllowedExecutor(executors[i], alloweds[i]);
    }

    /**
     * @dev Sets permissions for multiple proposal signers
     * @param signers List of proposal signer addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedProposalSigners(address[] memory signers, bool[] memory alloweds) external override onlyOwner {
        if (signers.length != alloweds.length) revert ControllerInputInvalidLength();
        for (uint256 i = 0; i < signers.length; i++) _setAllowedProposalSigner(signers[i], alloweds[i]);
    }

    /**
     * @dev Sets permissions for multiple validators
     * @param validators List of validator addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedValidators(address[] memory validators, bool[] memory alloweds) external override onlyOwner {
        if (validators.length != alloweds.length) revert ControllerInputInvalidLength();
        for (uint256 i = 0; i < validators.length; i++) _setAllowedValidator(validators[i], alloweds[i]);
    }

    /**
     * @dev Sets a solver permission
     */
    function _setAllowedSolver(address solver, bool allowed) internal {
        isSolverAllowed[solver] = allowed;
        emit SolverAllowedSet(solver, allowed);
    }

    /**
     * @dev Sets an executor permission
     */
    function _setAllowedExecutor(address executor, bool allowed) internal {
        isExecutorAllowed[executor] = allowed;
        emit ExecutorAllowedSet(executor, allowed);
    }

    /**
     * @dev Sets a proposal signer permission
     */
    function _setAllowedProposalSigner(address signer, bool allowed) internal {
        isProposalSignerAllowed[signer] = allowed;
        emit ProposalSignerAllowedSet(signer, allowed);
    }

    /**
     * @dev Sets a validator permission
     */
    function _setAllowedValidator(address validator, bool allowed) internal {
        isValidatorAllowed[validator] = allowed;
        emit ValidatorAllowedSet(validator, allowed);
    }
}
