import { fp, NATIVE_TOKEN_ADDRESS, randomEvmAddress } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { Authorization } from 'ethers'
import { network } from 'hardhat'

import {
  CallMock,
  EIP7702StatelessDeleGatorMock,
  SafeMock,
  SmartAccount7702,
  SmartAccountContract,
  SmartAccountsHandler,
  TokenMock,
} from '../../types/ethers-contracts/index.js'
import { signDelegation } from '../helpers/delegations.js'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('SmartAccountsHandler', () => {
  let handler: SmartAccountsHandler,
    smartAccountContract: SmartAccountContract,
    smartAccount7702: SmartAccount7702,
    smartAccountDelegator: EIP7702StatelessDeleGatorMock,
    safe: SafeMock
  let owner: HardhatEthersSigner, user: HardhatEthersSigner

  beforeEach('setup signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, user] = await ethers.getSigners()
  })

  beforeEach('deploy contracts', async () => {
    handler = await ethers.deployContract('SmartAccountsHandler')
    smartAccount7702 = await ethers.deployContract('SmartAccount7702', [handler])
    smartAccountContract = await ethers.deployContract('SmartAccountContract', [handler, owner])
    smartAccountDelegator = await ethers.deployContract('EIP7702StatelessDeleGatorMock', [owner])
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
      expect(await handler.isSmartAccount(smartAccountContract)).to.be.true
    })

    it('returns true for a Safe', async () => {
      expect(await handler.isSmartAccount(safe)).to.be.true
    })
  })

  describe('transfer', () => {
    const amount = fp(1)
    const recipient = randomEvmAddress()

    context('when the account is supported', () => {
      context('when the account is a Mimic smart account', () => {
        context('when transferring native tokens', () => {
          const token = NATIVE_TOKEN_ADDRESS

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: smartAccountContract, value: amount, data: '0x' })
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(smartAccountContract, token, recipient, amount)

            const events = await smartAccountContract.queryFilter(
              smartAccountContract.filters.Transferred(),
              tx.blockNumber
            )
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
            await token.mint(smartAccountContract, amount)
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(smartAccountContract, token, recipient, amount)

            const events = await smartAccountContract.queryFilter(
              smartAccountContract.filters.Transferred(),
              tx.blockNumber
            )
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.token).to.equal(token)
            expect(events[0].args.amount).to.equal(amount)
            expect(events[0].args.recipient.toLowerCase()).to.equal(recipient)
          })
        })
      })

      context('when the account is a Mimic 7702 smart account', () => {
        let authorization: Authorization

        beforeEach('sign authorization', async () => {
          authorization = await user.authorize({ address: smartAccount7702 })
        })

        context('when transferring native tokens', () => {
          const token = NATIVE_TOKEN_ADDRESS

          it('executes a transfer', async () => {
            const tx = await handler.transfer(user, token, recipient, amount, { authorizationList: [authorization] })

            const userSmartAccount = await ethers.getContractAt('ISmartAccount', user)
            const events = await userSmartAccount.queryFilter(smartAccount7702.filters.Transferred(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.token).to.equal(token)
            expect(events[0].args.amount).to.equal(amount)
            expect(events[0].args.recipient.toLowerCase()).to.equal(recipient)

            expect(await handler.isSmartAccount(user)).to.be.true
          })
        })

        context('when transferring ERC20', () => {
          let token: TokenMock

          beforeEach('deploy token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
            await token.mint(user, amount)
          })

          it('executes a transfer', async () => {
            const tx = await handler.transfer(user, token, recipient, amount, { authorizationList: [authorization] })

            const userSmartAccount = await ethers.getContractAt('ISmartAccount', user)
            const events = await userSmartAccount.queryFilter(smartAccount7702.filters.Transferred(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)
            expect(events[0].args.token).to.equal(token)
            expect(events[0].args.amount).to.equal(amount)
            expect(events[0].args.recipient.toLowerCase()).to.equal(recipient)
          })
        })
      })

      context('when the account is a Safe', () => {
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

    context('when the account is not supported', () => {
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
      context('when the account is a Mimic smart account', () => {
        context('when the inner call succeeds', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('call')
          })

          const itExecutesTheCallWithValue = (value: bigint) => {
            it('executes a call', async () => {
              const tx = await handler.call(smartAccountContract, callMock, data, value)

              const events = await smartAccountContract.queryFilter(
                smartAccountContract.filters.Called(),
                tx.blockNumber
              )
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
              await owner.sendTransaction({ to: smartAccountContract, value, data: '0x' })
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
            await expect(handler.call(smartAccountContract, callMock, data, 0)).to.be.revertedWithCustomError(
              callMock,
              'CallError'
            )
          })
        })
      })

      context('when the account is a Mimic 7702 smart account', () => {
        let authorization: Authorization

        beforeEach('sign authorization', async () => {
          authorization = await user.authorize({ address: smartAccount7702 })
        })

        context('when the inner call succeeds', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('call')
          })

          const itExecutesTheCallWithValue = (value: bigint) => {
            it('executes a call', async () => {
              const tx = await handler.call(user, callMock, data, value, { authorizationList: [authorization] })

              const userSmartAccount = await ethers.getContractAt('ISmartAccount', user)
              const events = await userSmartAccount.queryFilter(smartAccountContract.filters.Called(), tx.blockNumber)
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

            itExecutesTheCallWithValue(value)
          })
        })

        context('when the inner call fails', () => {
          let data: string

          beforeEach('encode call data', () => {
            data = callMock.interface.encodeFunctionData('callError')
          })

          it('bubbles the error', async () => {
            await expect(
              handler.call(user, callMock, data, 0, { authorizationList: [authorization] })
            ).to.be.revertedWithCustomError(callMock, 'CallError')
          })
        })
      })

      context('when the account is a Safe', () => {
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
            await expect(handler.call(smartAccountContract, callMock, data, 0)).to.be.revertedWithCustomError(
              callMock,
              'CallError'
            )
          })
        })
      })

      context('when the account is a 7702 Stateless Delegator', () => {
        let authorization: Authorization

        beforeEach('sign authorization', async () => {
          authorization = await user.authorize({ address: smartAccountDelegator })
        })

        context('when the inner call succeeds', () => {
          let callData: string

          beforeEach('encode call data', async () => {
            callData = callMock.interface.encodeFunctionData('call')
          })

          const itExecutesTheCallWithValue = (value: bigint) => {
            it('executes a call', async () => {
              const delegationManager = await smartAccountDelegator.delegationManager()
              const permissionContext = await signDelegation(user, handler.target, delegationManager)
              const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes', 'bytes'], [permissionContext, callData])

              const tx = await handler.call(smartAccountDelegator, callMock, data, value, {
                authorizationList: [authorization],
              })

              const receipt = await tx.wait()

              const events = await callMock.queryFilter(
                callMock.filters.CallReceived(),
                receipt!.blockNumber,
                receipt!.blockNumber
              )

              expect(events).to.have.lengthOf(1)
              expect(events[0].args.sender).to.equal(user)
              expect(events[0].args.value).to.equal(value)
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
          let callData: string

          beforeEach('encode call data', () => {
            callData = callMock.interface.encodeFunctionData('callError')
          })

          it('bubbles the error', async () => {
            const delegationManager = await smartAccountDelegator.delegationManager()
            const permissionContext = await signDelegation(user, handler.target, delegationManager)
            const data = ethers.AbiCoder.defaultAbiCoder().encode(['bytes', 'bytes'], [permissionContext, callData])

            const promise = handler.call(smartAccountDelegator, callMock, data, 0, {
              authorizationList: [authorization],
            })

            await expect(promise).to.be.revertedWithCustomError(callMock, 'CallError')
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
