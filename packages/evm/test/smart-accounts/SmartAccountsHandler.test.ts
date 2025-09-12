import { fp, NATIVE_TOKEN_ADDRESS, randomAddress } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { network } from 'hardhat'

import {
  CallMock,
  SafeMock,
  SmartAccount,
  SmartAccountsHandler,
  TokenMock,
} from '../../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('SmartAccountsHandler', () => {
  let handler: SmartAccountsHandler, smartAccount: SmartAccount, safe: SafeMock
  let owner: HardhatEthersSigner

  beforeEach('setup signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner] = await ethers.getSigners()
  })

  beforeEach('deploy contracts', async () => {
    handler = await ethers.deployContract('SmartAccountsHandler')
    smartAccount = await ethers.deployContract('SmartAccount', [handler, owner])
    safe = await ethers.deployContract('SafeMock')
  })

  describe('isSmartAccount', () => {
    it('returns false for EOAs', async () => {
      expect(await handler.isSmartAccount(owner)).to.be.false
    })

    it('returns false for random non-ERC165 contracts', async () => {
      expect(await handler.isSmartAccount(handler)).to.be.false
    })

    it('returns true for a Mimic SmartAccount', async () => {
      expect(await handler.isSmartAccount(smartAccount)).to.be.true
    })

    it('returns true for a Safe', async () => {
      expect(await handler.isSmartAccount(safe)).to.be.true
    })
  })

  describe('transfer', () => {
    const amount = fp(1)
    const recipient = randomAddress()

    context('when account is supported', () => {
      context('when account is a Mimic smart account', () => {
        context('when transferring native tokens', () => {
          const token = NATIVE_TOKEN_ADDRESS

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: smartAccount, value: amount, data: '0x' })
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(smartAccount, token, recipient, amount)

            const events = await smartAccount.queryFilter(smartAccount.filters.Transferred(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.token).to.equal(token)
            expect(events[0].args.amount).to.equal(amount)
            expect(events[0].args.recipient.toLowerCase()).to.equal(recipient)
          })
        })

        context('when transferring ERC20', () => {
          let token: TokenMock

          beforeEach('deploy token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
            await token.mint(smartAccount, amount)
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(smartAccount, token, recipient, amount)

            const events = await smartAccount.queryFilter(smartAccount.filters.Transferred(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.token).to.equal(token)
            expect(events[0].args.amount).to.equal(amount)
            expect(events[0].args.recipient.toLowerCase()).to.equal(recipient)
          })
        })
      })

      context('when account is a Safe', () => {
        context('when transferring native tokens', () => {
          const token = NATIVE_TOKEN_ADDRESS

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: safe, value: amount, data: '0x' })
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(safe, token, recipient, amount)

            const events = await safe.queryFilter(safe.filters.ModuleTxExecuted(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.target.toLowerCase()).to.equal(recipient)
            expect(events[0].args.data).to.equal('0x')
            expect(events[0].args.value).to.equal(amount)
            expect(events[0].args.operation).to.equal(0)
            expect(events[0].args.success).to.equal(true)
            expect(events[0].args.result).to.equal('0x')
          })
        })

        context('when transferring ERC20', () => {
          let token: TokenMock

          beforeEach('deploy token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
            await token.mint(safe, amount)
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(safe, token, recipient, amount)

            const events = await safe.queryFilter(safe.filters.ModuleTxExecuted(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.target).to.equal(token)
            expect(events[0].args.data).to.equal(token.interface.encodeFunctionData('transfer', [recipient, amount]))
            expect(events[0].args.value).to.equal(0)
            expect(events[0].args.operation).to.equal(0)
            expect(events[0].args.success).to.equal(true)
            expect(events[0].args.result).to.equal(token.interface.encodeFunctionResult('transfer', [true]))
          })
        })
      })
    })

    context('when account is not supported', () => {
      it('reverts', async () => {
        await expect(handler.transfer(handler, NATIVE_TOKEN_ADDRESS, recipient, amount)).to.be.revertedWithCustomError(
          handler,
          'SmartAccountsHandlerUnsupportedAccount'
        )
      })
    })
  })

  describe('call', () => {
    let callMock: CallMock

    beforeEach('deploy call mock', async () => {
      callMock = await ethers.deployContract('CallMock')
    })

    context('when the account is supported', () => {
      context('when account is a Mimic smart account', () => {
        context('when the inner call succeeds', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('call')
          })

          const itExecutesTheCallWithValue = (value: bigint) => {
            it('executes a call', async () => {
              const tx = await handler.call(smartAccount, callMock, data, value)

              const events = await smartAccount.queryFilter(smartAccount.filters.Called(), tx.blockNumber)
              expect(events).to.have.lengthOf(1)
              expect(events[0].args.target).to.equal(callMock)
              expect(events[0].args.data).to.equal(data)
              expect(events[0].args.value).to.equal(value)
              expect(events[0].args.result).to.equal('0x')
            })
          }

          context('when sending no value', () => {
            const value = 0n

            itExecutesTheCallWithValue(value)
          })

          context('when sending value', () => {
            const value = 1n

            beforeEach('fund smart account', async () => {
              await owner.sendTransaction({ to: smartAccount, value, data: '0x' })
            })

            itExecutesTheCallWithValue(value)
          })
        })

        context('when the inner call fails', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('callError')
          })

          it('bubbles the error', async () => {
            await expect(handler.call(smartAccount, callMock, data, 0)).to.be.revertedWithCustomError(
              callMock,
              'CallError'
            )
          })
        })
      })

      context('when account is a Safe', () => {
        context('when the inner call succeeds', () => {
          let data: string

          beforeEach('encode call data', async () => {
            data = callMock.interface.encodeFunctionData('call')
          })

          const itExecutesTheCallWithValue = (value: bigint) => {
            it('executes a call', async () => {
              const tx = await handler.call(safe, callMock, data, value)

              const events = await safe.queryFilter(safe.filters.ModuleTxExecuted(), tx.blockNumber)
              expect(events).to.have.lengthOf(1)
              expect(events[0].args.target).to.equal(callMock)
              expect(events[0].args.data).to.equal(data)
              expect(events[0].args.value).to.equal(value)
              expect(events[0].args.operation).to.equal(0)
              expect(events[0].args.success).to.equal(true)
              expect(events[0].args.result).to.equal('0x')
            })
          }

          context('when sending no value', () => {
            const value = 0n

            itExecutesTheCallWithValue(value)
          })

          context('when sending value', () => {
            const value = 1n

            beforeEach('fund smart account', async () => {
              await owner.sendTransaction({ to: safe, value, data: '0x' })
            })

            itExecutesTheCallWithValue(value)
          })
        })

        context('when the inner call fails', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('callError')
          })

          it('bubbles the error', async () => {
            await expect(handler.call(smartAccount, callMock, data, 0)).to.be.revertedWithCustomError(
              callMock,
              'CallError'
            )
          })
        })
      })
    })

    context('when the account is not supported', () => {
      it('reverts', async () => {
        await expect(handler.call(handler, callMock, '0x', 0)).to.be.revertedWithCustomError(
          handler,
          'SmartAccountsHandlerUnsupportedAccount'
        )
      })
    })
  })
})
