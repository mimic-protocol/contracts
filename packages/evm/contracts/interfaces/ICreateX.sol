// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity ^0.8.4;

/**
 * @title CreateX Factory Interface Definition
 * @author pcaversaccio (https://web.archive.org/web/20230921103111/https://pcaversaccio.com/)
 * @custom:coauthor Matt Solomon (https://web.archive.org/web/20230921103335/https://mattsolomon.dev/)
 */
interface ICreateX {
    event ContractCreation(address indexed newContract);

    function deployCreate3(bytes32 salt, bytes memory initCode) external payable returns (address newContract);
}
