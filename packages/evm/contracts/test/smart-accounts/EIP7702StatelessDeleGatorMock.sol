// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { DelegationManager } from 'delegation-framework/DelegationManager.sol';
import { IEntryPoint, EIP7702StatelessDeleGator } from 'delegation-framework/EIP7702/EIP7702StatelessDeleGator.sol';

contract EIP7702StatelessDeleGatorMock is EIP7702StatelessDeleGator {
    constructor(address owner) EIP7702StatelessDeleGator(new DelegationManager(owner), IEntryPoint(address(0))) {
        // solhint-disable-previous-line no-empty-blocks
    }
}
