import { randomEvmAddress, randomHex } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { id, keccak256 } from 'ethers'
import { network } from 'hardhat'

import { MimicHelper } from '../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

describe('MimicHelper', () => {
  let mimicHelper: MimicHelper
  let other: HardhatEthersSigner
  let user: HardhatEthersSigner

  beforeEach('deploy mimic helper', async () => {
    // eslint-disable-next-line prettier/prettier
    [, user, other] = await ethers.getSigners()
    mimicHelper = await ethers.deployContract('MimicHelper', [])
  })

  describe('getNativeTokenBalance', () => {
    context('when the target has balance', () => {
      it('returns the correct balance', async () => {
        const balance = await mimicHelper.getNativeTokenBalance(user.address)
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

  describe('setStorage', () => {
    const key = 'test-key'
    const data = randomHex(64)

    beforeEach('set sender', () => {
      mimicHelper = mimicHelper.connect(user)
    })

    context('when the user had no data on key', () => {
      it('sets the data', async () => {
        const tx = await mimicHelper.setStorage(key, data)

        const currentData = await mimicHelper.getStorage(user.address, key)
        expect(currentData).to.be.equal(data)

        const events = await mimicHelper.queryFilter(mimicHelper.filters.StorageSet(), tx.blockNumber)
        expect(events).to.have.lengthOf(1)
        expect(events[0].args.user).to.equal(user)
        expect(events[0].args.key.hash).to.equal(id(key))
        expect(events[0].args.data.hash).to.equal(keccak256(data))
      })
    })

    context('when the user already had data on key', () => {
      const previousData = randomHex(64)

      beforeEach('set data', async () => {
        await mimicHelper.setStorage(key, previousData)
      })

      it('replaces the previous data', async () => {
        const tx = await mimicHelper.setStorage(key, data)

        const currentData = await mimicHelper.getStorage(user.address, key)
        expect(currentData).to.be.equal(data)
        expect(currentData).to.not.be.equal(previousData)

        const events = await mimicHelper.queryFilter(mimicHelper.filters.StorageSet(), tx.blockNumber)
        expect(events).to.have.lengthOf(1)
        expect(events[0].args.user).to.equal(user)
        expect(events[0].args.key.hash).to.equal(id(key))
        expect(events[0].args.data.hash).to.equal(keccak256(data))
      })
    })

    context('when another user already used the key', () => {
      const otherData = randomHex(64)

      beforeEach('set data', async () => {
        await mimicHelper.setStorage(key, data)
        mimicHelper = mimicHelper.connect(other)
      })

      it('differentiates the data', async () => {
        const beforeData = await mimicHelper.getStorage(other.address, key)
        expect(beforeData).to.not.be.equal(data)
        expect(beforeData).to.be.equal('0x')

        await mimicHelper.setStorage(key, otherData)
        const afterData = await mimicHelper.getStorage(other.address, key)
        expect(afterData).to.not.be.equal(data)
        expect(afterData).to.be.equal(otherData)
      })
    })
  })
})
