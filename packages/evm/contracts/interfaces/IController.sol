// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title Controller interface
 */
interface IController {
    /**
     * @dev The input arrays are not of equal length
     */
    error ControllerInputInvalidLength();

    /**
     * @dev Emitted every time a solver permission is set
     */
    event SolverAllowedSet(address indexed solver, bool allowed);

    /**
     * @dev Emitted every time an executor permission is set
     */
    event ExecutorAllowedSet(address indexed executor, bool allowed);

    /**
     * @dev Emitted every time a proposal signer permission is set
     */
    event ProposalSignerAllowedSet(address indexed proposalSigner, bool allowed);

    /**
     * @dev Emitted every time a validator permission is set
     */
    event ValidatorAllowedSet(address indexed validator, bool allowed);

    /**
     * @dev Emitted when the minimum validations changes
     */
    event MinValidationSet(uint8 indexed previousValue, uint8 indexed currentValue);

    /**
     * @dev Tells whether a solver is allowed
     * @param solver Address of the solver being queried
     */
    function isSolverAllowed(address solver) external view returns (bool);

    /**
     * @dev Tells whether an executor is allowed
     * @param executor Address of the executor being queried
     */
    function isExecutorAllowed(address executor) external view returns (bool);

    /**
     * @dev Tells whether a proposal signer is allowed
     * @param signer Address of the proposal signer being queried
     */
    function isProposalSignerAllowed(address signer) external view returns (bool);

    /**
     * @dev Tells whether a validator is allowed
     * @param validator Address of the validator being queried
     */
    function isValidatorAllowed(address validator) external view returns (bool);

    /**
     * @dev Tells the minimum number of validations allowed
     */
    function minValidations() external view returns (uint8);

    /**
     * @dev Sets permissions for multiple solvers
     * @param solvers List of solver addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedSolvers(address[] memory solvers, bool[] memory alloweds) external;

    /**
     * @dev Sets permissions for multiple executors
     * @param executors List of executor addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedExecutors(address[] memory executors, bool[] memory alloweds) external;

    /**
     * @dev Sets permissions for multiple proposal signers
     * @param signers List of proposal signer addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedProposalSigners(address[] memory signers, bool[] memory alloweds) external;

    /**
     * @dev Sets permissions for multiple validators
     * @param validators List of validator addresses
     * @param alloweds List of permission statuses
     */
    function setAllowedValidators(address[] memory validators, bool[] memory alloweds) external;

    /**
     * @dev Sets the minimum number of validations allowed
     * @param newMinValidations minimum number of validations allowed
     */
    function setMinValidations(uint8 newMinValidations) external;
}
