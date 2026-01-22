import { randomEvmAddress } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { network } from 'hardhat'

import { MimicHelper } from '../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

describe('MimicHelper', () => {
  let mimicHelper: MimicHelper
  let other: HardhatEthersSigner

  beforeEach('deploy mimic helper', async () => {
    // eslint-disable-next-line prettier/prettier
    [, other] = await ethers.getSigners()
    mimicHelper = await ethers.deployContract('MimicHelper', [])
  })

  describe('getNativeTokenBalance', () => {
    context('when the target has balance', () => {
      it('returns the correct balance', async () => {
        const balance = await mimicHelper.getNativeTokenBalance(other.address)
        expect(balance).to.be.equal(10000000000000000000000n)
      })
    })

    context('when the target has no balance', () => {
      it('returns 0', async () => {
        const balance = await mimicHelper.getNativeTokenBalance(randomEvmAddress())
        expect(balance).to.be.equal(0)
      })
    })
  })
})
