import { BigNumberish, fp, NATIVE_TOKEN_ADDRESS, randomEvmAddress } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { Authorization } from 'ethers'
import { network } from 'hardhat'

import { CallMock, Controller, Settler, SmartAccount7702, TokenMock } from '../../types/ethers-contracts/index.js'
import { Account, toAddress } from '../helpers'
import { createCallIntent, createTransferIntent } from '../helpers/intents'
import { createCallProposal, createTransferProposal, signProposal } from '../helpers/proposal'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('SmartAccount7702', () => {
  let smartAccount: SmartAccount7702
  let settler: Settler, controller: Controller
  let user: HardhatEthersSigner, admin: HardhatEthersSigner, solver: HardhatEthersSigner

  beforeEach('deploy contracts', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, user, solver] = await ethers.getSigners()
    controller = await ethers.deployContract('Controller', [admin, [solver], [], [admin], [], 0])
    settler = await ethers.deployContract('Settler', [controller, admin])
    smartAccount = await ethers.deployContract('SmartAccount7702', [settler])
  })

  describe('initialization', () => {
    it('has a reference to the settler', async () => {
      expect(await smartAccount.settler()).to.be.equal(settler)
    })
  })

  context('transfer', () => {
    let token: TokenMock | string
    const amount = fp(1)
    const recipient = randomEvmAddress()

    context('when the user signed the authorization', () => {
      let authorization: Authorization

      beforeEach('sign authorization', async () => {
        authorization = await user.authorize({ address: smartAccount.target })
      })

      context('when the sender is the settler', () => {
        const balanceOf = (token: TokenMock | string, account: Account) => {
          const accountAddress = toAddress(account)
          if (token == NATIVE_TOKEN_ADDRESS) return ethers.provider.getBalance(accountAddress)
          else return token.balanceOf(accountAddress)
        }

        const itExecutesTheIntent = () => {
          it('executes the intent', async () => {
            const preUserTokenBalance = await balanceOf(token, user)
            const preRecipientBalance = await balanceOf(token, recipient)

            const intent = createTransferIntent({ settler, user, transfers: [{ token, amount, recipient }] })
            const proposal = createTransferProposal()
            const signature = await signProposal(settler, intent, solver, proposal, admin)
            const options = { authorizationList: [authorization] }
            const tx = await settler.connect(solver).execute([{ intent, proposal, signature }], options)

            const userSmartAccount = await ethers.getContractAt('ISmartAccount', user)
            const userEvents = await userSmartAccount.queryFilter(smartAccount.filters.Transferred(), tx.blockNumber)
            expect(userEvents).to.have.lengthOf(1)
            expect(userEvents[0].args.token).to.be.equal(token)
            expect(userEvents[0].args.amount).to.be.equal(amount)
            expect(userEvents[0].args.recipient.toLowerCase()).to.be.equal(recipient)

            const postUserTokenBalance = await balanceOf(token, intent.user)
            expect(preUserTokenBalance - postUserTokenBalance).to.be.eq(amount)

            const postRecipientBalance = await balanceOf(token, recipient)
            expect(postRecipientBalance - preRecipientBalance).to.be.eq(amount)
          })
        }

        context('when the token is an ERC20', () => {
          beforeEach('deploy and mint tokens', async () => {
            token = await ethers.deployContract('TokenMock', ['WETH', 18])
            await token.mint(user, amount)
          })

          itExecutesTheIntent()
        })

        context('when the token is the native token', () => {
          beforeEach('set token', async () => {
            token = NATIVE_TOKEN_ADDRESS
          })

          itExecutesTheIntent()
        })
      })

      context('when the sender is not the settler', () => {
        it('reverts', async () => {
          const data = smartAccount.interface.encodeFunctionData('transfer', [NATIVE_TOKEN_ADDRESS, recipient, amount])

          await expect(
            solver.sendTransaction({ to: user, data, authorizationList: [authorization] })
          ).to.be.revertedWithCustomError(smartAccount, 'SmartAccount7702SenderNotSettler')
        })
      })
    })

    context('when the user did not sign an authorization', () => {
      it('reverts', async () => {
        const data = smartAccount.interface.encodeFunctionData('transfer', [NATIVE_TOKEN_ADDRESS, recipient, amount])

        await expect(solver.sendTransaction({ to: user, data })).to.be.reverted
      })
    })
  })

  describe('call', () => {
    let target: CallMock

    beforeEach('deploy call mock', async () => {
      target = await ethers.deployContract('CallMock')
    })

    context('when the user signed the authorization', () => {
      let authorization: Authorization

      beforeEach('sign authorization', async () => {
        authorization = await user.authorize({ address: smartAccount.target })
      })

      context('when the sender is the settler', () => {
        const itWorksProperly = (value: BigNumberish) => {
          context('when the call succeeds', () => {
            let data: string

            beforeEach('encode call', async () => {
              data = target.interface.encodeFunctionData('call')
            })

            it('executes the intent', async () => {
              const intent = createCallIntent({ settler, user, calls: [{ target: target, data, value }] })
              const proposal = createCallProposal()
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              const options = { authorizationList: [authorization] }

              const tx = await settler.connect(solver).execute([{ intent, proposal, signature }], options)

              const userSmartAccount = await ethers.getContractAt('ISmartAccount', user)
              const userEvents = await userSmartAccount.queryFilter(smartAccount.filters.Called(), tx.blockNumber)
              expect(userEvents).to.have.lengthOf(1)
              expect(userEvents[0].args.target).to.be.equal(target)
              expect(userEvents[0].args.data).to.be.equal(data)
              expect(userEvents[0].args.result).to.be.equal('0x')
              expect(userEvents[0].args.value).to.be.equal(value)

              const targetEvents = await target.queryFilter(target.filters.CallReceived(), tx.blockNumber)
              expect(targetEvents).to.have.lengthOf(1)
              expect(targetEvents[0].args.sender).to.be.equal(user)
              expect(targetEvents[0].args.value).to.be.equal(value)
            })
          })

          context('when the call fails', () => {
            let data: string

            beforeEach('encode call', async () => {
              data = target.interface.encodeFunctionData('callError')
            })

            it('reverts', async () => {
              const intent = createCallIntent({ settler, user, calls: [{ target, data, value }] })
              const proposal = createCallProposal()
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              const options = { authorizationList: [authorization] }

              await expect(
                settler.connect(solver).execute([{ intent, proposal, signature }], options)
              ).to.be.revertedWithCustomError(target, 'CallError')
            })
          })
        }

        context('when the value is 0', () => {
          itWorksProperly(0)
        })

        context('when the value is greater than 0', () => {
          const value = 10

          itWorksProperly(value)
        })
      })

      context('when the sender is not the settler', () => {
        it('reverts', async () => {
          const targetData = target.interface.encodeFunctionData('call')
          const txData = smartAccount.interface.encodeFunctionData('call', [target.target, targetData, 0])

          await expect(
            solver.sendTransaction({ to: user, data: txData, authorizationList: [authorization] })
          ).to.be.revertedWithCustomError(smartAccount, 'SmartAccount7702SenderNotSettler')
        })
      })
    })

    context('when the user did not sign an authorization', () => {
      it('reverts', async () => {
        const targetData = target.interface.encodeFunctionData('call')
        const txData = smartAccount.interface.encodeFunctionData('call', [target.target, targetData, 0])

        await expect(solver.sendTransaction({ to: user, data: txData })).to.be.reverted
      })
    })
  })
})
