import { fp, randomAddress, randomHex } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { network } from 'hardhat'

import { CallMock, SmartAccount, SmartAccountHandler, TokenMock } from '../../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('SmartAccountHandler', () => {
  let handler: SmartAccountHandler, smartAccount: SmartAccount
  let owner: HardhatEthersSigner

  beforeEach('setup signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner] = await ethers.getSigners()
  })

  beforeEach('deploy contracts', async () => {
    handler = await ethers.deployContract('SmartAccountHandler')
    smartAccount = await ethers.deployContract('SmartAccount', [handler.target, owner.address])
  })

  describe('isSmartAccount', () => {
    it('returns false for EOAs', async () => {
      expect(await handler.isSmartAccount(owner.address)).to.be.false
    })

    it('returns false for random non-ERC165 contracts', async () => {
      expect(await handler.isSmartAccount(handler.target)).to.be.false
    })

    it('returns true for a Mimic SmartAccount', async () => {
      expect(await handler.isSmartAccount(smartAccount.target)).to.be.true
    })
  })

  describe('transfer', () => {
    let token: TokenMock
    const amount = fp(10)
    const recipient = randomAddress()

    beforeEach('deploy token', async () => {
      token = await ethers.deployContract('TokenMock', ['TKN', 18])
    })

    context('when account is supported', () => {
      context('when account is a Mimic SmartAccount', () => {
        beforeEach('fund SmartAccount', async () => {
          await token.mint(smartAccount.target, amount * 5n)
        })

        it('moves tokens and emits SmartAccount.Transferred', async () => {
          const preRecipientBalance = await token.balanceOf(recipient)
          const preSmartAccountBalance = await token.balanceOf(smartAccount.target)

          await handler.transfer(smartAccount.target, token.target, recipient, amount)

          const postRecipientBalance = await token.balanceOf(recipient)
          expect(postRecipientBalance).to.equal(preRecipientBalance + amount)

          const postSmartAccountBalance = await token.balanceOf(smartAccount.target)
          expect(postSmartAccountBalance).to.equal(preSmartAccountBalance - amount)
        })
      })
    })

    context('when account is not supported', () => {
      it('reverts', async () => {
        await expect(handler.transfer(handler.target, token.target, recipient, 1n))
          .to.be.revertedWithCustomError(handler, 'SmartAccountHandlerUnsupportedAccount')
          .withArgs(handler.target)
      })
    })
  })

  describe('call', () => {
    let callMock: CallMock

    beforeEach('deploy call mock', async () => {
      callMock = await ethers.deployContract('CallMock')
    })

    context('when the account is supported', () => {
      context('when the inner call succeeds', () => {
        let data: string

        beforeEach('encode call data', async () => {
          data = callMock.interface.encodeFunctionData('call')
        })

        it('executes via SmartAccount and emits events', async () => {
          const tx = await handler.call(smartAccount.target, callMock.target, data, 0)

          const saEvents = await smartAccount.queryFilter(smartAccount.filters.Called(), tx.blockNumber)
          expect(saEvents).to.have.lengthOf(1)
          expect(saEvents[0].args.target).to.equal(callMock.target)
          expect(saEvents[0].args.data).to.equal(data)
          expect(saEvents[0].args.value).to.equal(0)
          expect(saEvents[0].args.result).to.equal('0x')

          const mockEvents = await callMock.queryFilter(callMock.filters.CallReceived(), tx.blockNumber)
          expect(mockEvents).to.have.lengthOf(1)
          expect(mockEvents[0].args.sender).to.equal(smartAccount.target)
          expect(mockEvents[0].args.value).to.equal(0)
        })
      })

      context('when the inner call fails', () => {
        const badData = randomHex(32)

        it('bubbles the SmartAccount custom error', async () => {
          await expect(handler.call(smartAccount.target, callMock.target, badData, 0)).to.be.revertedWithCustomError(
            smartAccount,
            'FailedCall'
          )
        })
      })
    })

    context('when the account is not supported', () => {
      it('reverts', async () => {
        await expect(handler.call(handler.target, callMock.target, '0x', 0))
          .to.be.revertedWithCustomError(handler, 'SmartAccountHandlerUnsupportedAccount')
          .withArgs(handler.target)
      })
    })
  })
})
