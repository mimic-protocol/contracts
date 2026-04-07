import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { AbiCoder } from 'ethers'
import { network } from 'hardhat'

import {
  SmartAccountContract,
  SmartAccountsHandler,
  SmartAccountsHandlerHelpersMock,
  StaticCallMock,
} from '../../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

describe('SmartAccountsHandlerHelpers', () => {
  let helper: SmartAccountsHandlerHelpersMock
  let handler: SmartAccountsHandler
  let smartAccount: SmartAccountContract
  let target: StaticCallMock
  let owner: HardhatEthersSigner

  beforeEach('setup signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner] = await ethers.getSigners()
  })

  beforeEach('deploy contracts', async () => {
    // eslint-disable-next-line no-secrets/no-secrets
    helper = await ethers.deployContract('SmartAccountsHandlerHelpersMock')
    handler = await ethers.deployContract('SmartAccountsHandler')
    smartAccount = await ethers.deployContract('SmartAccountContract', [helper, owner])
    target = await ethers.deployContract('StaticCallMock')
  })

  describe('call', () => {
    it('returns the expected bytes', async () => {
      const value = 11n
      const data = target.interface.encodeFunctionData('returnUint', [value])

      const result = await helper.call.staticCall(handler, smartAccount, target, data, 0)

      const expected = target.interface.encodeFunctionResult('returnUint', [value])
      expect(result).to.equal(expected)

      const [decoded] = AbiCoder.defaultAbiCoder().decode(['uint256'], result)
      expect(decoded).to.equal(value)
    })
  })
})
