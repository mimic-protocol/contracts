import { randomEvmAddress } from '@mimicprotocol/sdk'
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
    const itReturnsTheExpectedBytes = (
      name: string,
      args: unknown[],
      types: string[],
      expectedDecoded: unknown[]
    ): void => {
      it('returns the expected bytes', async () => {
        const data = target.interface.encodeFunctionData(name, args)
        const result = await helper.call.staticCall(handler, smartAccount, target, data, 0)
        const expected = target.interface.encodeFunctionResult(name, args)

        expect(result).to.equal(expected)
        expect(AbiCoder.defaultAbiCoder().decode(types, result)).to.deep.equal(expectedDecoded)
      })
    }

    context('when returning a uint256', () => {
      itReturnsTheExpectedBytes('returnUint', [11n], ['uint256'], [11n])
    })

    context('when returning a dynamic array', () => {
      const dynamicArray = [11n, 22n, 33n]

      itReturnsTheExpectedBytes('returnArray', [dynamicArray], ['uint256[]'], [dynamicArray])
    })

    context('when returning a fixed-length array', () => {
      const fixedArray = [44n, 55n, 66n]

      itReturnsTheExpectedBytes('returnFixedArray', [fixedArray], ['uint256[3]'], [fixedArray])
    })

    context('when returning a struct', () => {
      const struct = { a: 77n, b: randomEvmAddress() }

      itReturnsTheExpectedBytes('returnStruct', [struct], ['tuple(uint256 a,address b)'], [[struct.a, struct.b]])
    })
  })
})
