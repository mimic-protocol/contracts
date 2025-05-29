import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { getBytes, Wallet } from 'ethers'
import { network } from 'hardhat'

import {
  Controller,
  EmptyExecutorMock,
  MintExecutorMock,
  ReentrantExecutorMock,
  Settler,
  SmartAccount,
  TokenMock,
  TransferExecutorMock,
} from '../types/ethers-contracts/index.js'
import itBehavesLikeOwnable from './behaviors/Ownable.behavior'
import {
  Account,
  BigNumberish,
  bn,
  CallIntent,
  CallProposal,
  createCallIntent,
  createCallProposal,
  createIntent,
  createProposal,
  createSwapIntent,
  createSwapProposal,
  createTransferIntent,
  createTransferProposal,
  currentTimestamp,
  encodeIntent,
  encodeProposal,
  fp,
  Intent,
  MAX_UINT256,
  NATIVE_TOKEN_ADDRESS,
  ONES_BYTES32,
  Proposal,
  randomAddress,
  randomHex,
  shuffle,
  signProposal,
  SwapIntent,
  SwapProposal,
  toAddress,
  toArray,
  TransferIntent,
  TransferProposal,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from './helpers'

const { ethers } = await network.connect()

describe('Settler', () => {
  let settler: Settler, controller: Controller
  let user: HardhatEthersSigner, other: HardhatEthersSigner
  let admin: HardhatEthersSigner, owner: HardhatEthersSigner, solver: HardhatEthersSigner

  beforeEach('deploy settler', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, owner, user, other, solver] = await ethers.getSigners()
    controller = await ethers.deployContract('Controller', [admin.address, [], [], []])
    settler = await ethers.deployContract('Settler', [controller.target, owner.address])
  })

  const balanceOf = (token: TokenMock | string, account: Account) => {
    const accountAddress = toAddress(account)
    return typeof token === 'string' ? ethers.provider.getBalance(accountAddress) : token.balanceOf(accountAddress)
  }

  describe('initialize', () => {
    it('has a reference to the controller', async () => {
      expect(await settler.controller()).to.be.equal(controller.target)
    })
  })

  describe('ownable', () => {
    beforeEach('set instance', function () {
      this.owner = owner
      this.ownable = settler
    })

    itBehavesLikeOwnable()
  })

  describe('ERC5627', () => {
    it('implements the corresponding EIP712 domain', async () => {
      const domain = await settler.eip712Domain()

      expect(domain.fields).to.be.equal('0x0f')
      expect(domain.name).to.be.equal('Mimic Protocol Settler')
      expect(domain.version).to.be.equal('1')
      expect(domain.chainId).to.be.equal(31337)
      expect(domain.verifyingContract).to.be.equal(settler.target)
      expect(domain.salt).to.be.equal(ZERO_BYTES32)
      expect(domain.extensions).to.be.empty
    })
  })

  describe('getIntentHash', () => {
    it('computes intents hashes correctly', async () => {
      const intent = createIntent()

      const intentHash = await settler.getIntentHash(intent)
      expect(intentHash).to.be.equal(encodeIntent(intent))
    })
  })

  describe('getProposalHash', () => {
    it('computes proposal hashes correctly', async () => {
      const intent = createIntent()
      const proposal = createProposal()

      const proposalHash = await settler.getProposalHash(proposal, intent, solver.address)
      expect(proposalHash).to.be.equal(encodeProposal(proposal, intent, solver))
    })
  })

  describe('receive', () => {
    const value = 1

    it('accepts native tokens', async () => {
      await owner.sendTransaction({ to: settler.target, value })

      expect(await ethers.provider.getBalance(settler.target)).to.be.equal(value)
    })
  })

  describe('rescueFunds', () => {
    let token: TokenMock | string
    const airdrop = fp(10)

    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(owner)
      })

      context('when the recipient is not zero', () => {
        let recipient: HardhatEthersSigner

        beforeEach('set recipient', () => {
          recipient = user
        })

        const itWorksProperly = (amount: BigInt) => {
          it('transfers the tokens to the recipient', async () => {
            const preSettlerBalance = await balanceOf(token, settler)
            const preRecipientBalance = await balanceOf(token, recipient)

            await settler.rescueFunds(toAddress(token), recipient.address, amount)

            const postSettlerBalance = await balanceOf(token, settler)
            expect(postSettlerBalance).to.be.eq(preSettlerBalance - amount)

            const postRecipientBalance = await balanceOf(token, recipient)
            expect(postRecipientBalance).to.be.equal(preRecipientBalance + amount)
          })

          it('emits an event', async () => {
            const tx = await settler.rescueFunds(toAddress(token), recipient.address, amount)

            const events = await settler.queryFilter(settler.filters.FundsRescued(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)

            expect(events[0].args.token).to.be.equal(toAddress(token))
            expect(events[0].args.amount).to.be.equal(amount)
            expect(events[0].args.recipient).to.be.equal(recipient)
          })
        }

        context('when the token is an ERC20', () => {
          beforeEach('set token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
          })

          beforeEach('airdrop tokens', async () => {
            await token.mint(settler.target, airdrop)
          })

          context('when the owner withdraws the whole balance', () => {
            const amount = airdrop

            itWorksProperly(amount)
          })

          context('when the owner withdraws some balance', () => {
            const amount = airdrop / BigInt(2)

            itWorksProperly(amount)
          })
        })

        context('when the token is the native token', () => {
          beforeEach('set token', async () => {
            token = NATIVE_TOKEN_ADDRESS
          })

          beforeEach('airdrop tokens', async () => {
            await owner.sendTransaction({ to: settler.target, value: airdrop })
          })

          context('when the owner withdraws the whole balance', () => {
            const amount = airdrop

            itWorksProperly(amount)
          })

          context('when the owner withdraws some balance', () => {
            const amount = airdrop / BigInt(3)

            itWorksProperly(amount)
          })
        })
      })

      context('when the recipient is zero', () => {
        const recipient = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(settler.rescueFunds(randomAddress(), recipient, 0)).to.be.revertedWithCustomError(
            settler,
            'SettlerRescueFundsRecipientZero'
          )
        })
      })
    })

    context('when the sender is not the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(other)
      })

      it('reverts', async () => {
        await expect(settler.rescueFunds(ZERO_ADDRESS, ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(
          settler,
          // eslint-disable-next-line no-secrets/no-secrets
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })

  describe('execute', () => {
    context('validations', () => {
      const intentParams: Partial<Intent> = {}
      const proposalParams: Partial<Proposal> = {}

      const itReverts = (reason: string) => {
        it('reverts', async () => {
          const executions = []

          const executor = await ethers.deployContract('EmptyExecutorMock')
          for (let i = 0; i < 5; i++) {
            const intent = createSwapIntent({ settler })
            const proposal = createSwapProposal({ executor })
            const signature = await signProposal(settler, intent, solver, proposal, admin)
            executions.push({ intent, proposal, signature })
          }
          await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])

          const intent = createIntent(intentParams)
          const proposal = createProposal(proposalParams)
          executions.push({ intent, proposal, signature: '0x' })

          const shuffled = shuffle(executions)
          await expect(settler.execute(shuffled)).to.be.revertedWithCustomError(settler, reason)
        })
      }

      context('when the sender is an allowed solver', () => {
        beforeEach('allow solver and set sender', async () => {
          await controller.connect(admin).setAllowedSolvers([solver.address], [true])
          settler = settler.connect(solver)
        })

        context('when the settler contract is correct', () => {
          beforeEach('set settler', () => {
            intentParams.user = user
            intentParams.settler = settler
          })

          context('when the nonce is not zero', () => {
            beforeEach('set nonce', () => {
              intentParams.nonce = randomHex(32)
            })

            context('when the nonce has not been used', () => {
              context('when the intent deadline has not been reached', () => {
                beforeEach('set intent deadline', async () => {
                  const now = await currentTimestamp()
                  intentParams.deadline = now + BigInt(60 * 10)
                })

                context('when the proposal deadline has not been reached', () => {
                  beforeEach('set proposal deadline', async () => {
                    const now = await currentTimestamp()
                    proposalParams.deadline = now + BigInt(60 * 10)
                  })

                  context('when the proposal has been signed properly', () => {
                    beforeEach('allow proposal signer', async () => {
                      await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
                    })

                    context('for swap intents', () => {
                      const swapIntentParams: Partial<SwapIntent> = {}
                      const swapProposalParams: Partial<SwapProposal> = {}
                      let tokenIn: TokenMock, tokenOut: TokenMock, executor: MintExecutorMock

                      const amountIn = fp(1)
                      const proposedAmountOut = amountIn - 1n
                      const minAmount = proposedAmountOut - 1n

                      beforeEach('set tokens', async () => {
                        tokenIn = await ethers.deployContract('TokenMock', ['IN', 18])
                        tokenOut = await ethers.deployContract('TokenMock', ['OUT', 18])
                        swapIntentParams.tokensIn = [{ token: tokenIn, amount: amountIn }]
                        swapIntentParams.tokensOut = [{ token: tokenOut, recipient: other, minAmount }]
                      })

                      beforeEach('set executor', async () => {
                        executor = await ethers.deployContract('MintExecutorMock')
                        swapProposalParams.executor = executor
                      })

                      beforeEach('mint and approve tokens', async () => {
                        await tokenIn.mint(user.address, amountIn)
                        await tokenIn.connect(user).approve(settler.target, amountIn)
                      })

                      const itReverts = (reason: string) => {
                        it('reverts', async () => {
                          const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                          const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                          const signature = await signProposal(settler, intent, solver, proposal, admin)

                          await expect(
                            settler.execute([{ intent, proposal, signature }])
                          ).to.be.revertedWithCustomError(settler, reason)
                        })
                      }

                      const itValidatesIntentsProperly = (sourceChain: number, destinationChain: number) => {
                        beforeEach('set source and destination chains', () => {
                          swapIntentParams.sourceChain = sourceChain
                          swapIntentParams.destinationChain = destinationChain
                        })

                        context('when the proposed amounts length is correct', () => {
                          beforeEach('set proposed amounts', () => {
                            swapProposalParams.amountsOut = [proposedAmountOut]
                          })

                          context('when no recipient is the settler', () => {
                            beforeEach('set recipient', () => {
                              toArray(swapIntentParams.tokensOut).forEach((tokenOut) => {
                                tokenOut.recipient = other
                              })
                            })

                            context('when the proposal amount is greater than the min amount', () => {
                              beforeEach('set proposal amount', () => {
                                swapProposalParams.amountsOut = [minAmount + 1n]
                              })

                              const itExecutesTheProposalSuccessfully = () => {
                                const itExecutesSuccessfully = () => {
                                  it('executes successfully', async () => {
                                    const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                                    const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                                    const signature = await signProposal(settler, intent, solver, proposal, admin)

                                    const tx = await settler.execute([{ intent, proposal, signature }])

                                    const executorEvents = await executor.queryFilter(
                                      executor.filters.Minted(),
                                      tx.blockNumber
                                    )
                                    expect(executorEvents).to.have.lengthOf(1)

                                    const settlerEvents = await settler.queryFilter(
                                      settler.filters.Executed(),
                                      tx.blockNumber
                                    )
                                    expect(settlerEvents).to.have.lengthOf(1)

                                    const proposalHash = await settler.getProposalHash(proposal, intent, solver.address)
                                    expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                                  })
                                }

                                context('when the amount out is greater than the proposal amount', () => {
                                  const amountOut = proposedAmountOut + 1n

                                  beforeEach('set swap proposal data', async () => {
                                    swapProposalParams.data = executor.interface.encodeFunctionData('mint', [
                                      tokenOut.target,
                                      amountOut,
                                    ])
                                  })

                                  itExecutesSuccessfully()
                                })

                                context('when the amount out is lower than the proposal amount', () => {
                                  const amountOut = proposedAmountOut - 1n

                                  beforeEach('set swap proposal data', async () => {
                                    swapProposalParams.data = executor.interface.encodeFunctionData('mint', [
                                      tokenOut.target,
                                      amountOut,
                                    ])
                                  })

                                  if (destinationChain == 31337) itReverts('SettlerAmountOutLtProposed')
                                  else itExecutesSuccessfully()
                                })
                              }

                              context('when the executor is allowed', () => {
                                beforeEach('allow executor', async () => {
                                  await controller.connect(admin).setAllowedExecutors([executor.target], [true])
                                })

                                itExecutesTheProposalSuccessfully()
                              })

                              context('when the executor is not allowed', () => {
                                beforeEach('disallow executor', async () => {
                                  await controller.connect(admin).setAllowedExecutors([executor.target], [false])
                                })

                                if (sourceChain == destinationChain) itExecutesTheProposalSuccessfully()
                                else itReverts('SettlerExecutorNotAllowed')
                              })
                            })

                            context('when the proposal amount is lower than the min amount', () => {
                              beforeEach('set proposal amount', () => {
                                swapProposalParams.amountsOut = [minAmount - 1n]
                              })

                              itReverts('SettlerProposedAmountLtMinAmount')
                            })
                          })

                          context('when a recipient is the settler', () => {
                            beforeEach('set recipient', () => {
                              toArray(swapIntentParams.tokensOut).forEach((tokenOut) => {
                                tokenOut.recipient = settler
                              })
                            })

                            itReverts('SettlerInvalidRecipient')
                          })
                        })

                        context('when the proposed amounts length is not correct', () => {
                          beforeEach('set proposed amounts', () => {
                            swapProposalParams.amountsOut = [minAmount, minAmount]
                          })

                          // eslint-disable-next-line no-secrets/no-secrets
                          itReverts('SettlerInvalidProposedAmounts')
                        })
                      }

                      context('when the source chain is the current chain', () => {
                        const sourceChain = 31337

                        context('when the destination chain is the current chain', () => {
                          const destinationChain = 31337

                          itValidatesIntentsProperly(sourceChain, destinationChain)
                        })

                        context('when the destination chain is not the current chain', () => {
                          const destinationChain = 1

                          itValidatesIntentsProperly(sourceChain, destinationChain)
                        })
                      })

                      context('when the source chain is not the current chain', () => {
                        const sourceChain = 1

                        context('when the destination chain is the current chain', () => {
                          const destinationChain = 31337

                          itValidatesIntentsProperly(sourceChain, destinationChain)
                        })

                        context('when the destination chain is not the current chain', () => {
                          const destinationChain = 1

                          beforeEach('set source and destination chains', () => {
                            swapIntentParams.sourceChain = sourceChain
                            swapIntentParams.destinationChain = destinationChain
                          })

                          itReverts('SettlerInvalidChain')
                        })
                      })
                    })

                    context('for transfer intents', () => {
                      const transferIntentParams: Partial<TransferIntent> = {}
                      const transferProposalParams: Partial<TransferProposal> = {}
                      let token: TokenMock

                      const amount = fp(1)
                      const feeAmount = fp(0.1)

                      beforeEach('set token', async () => {
                        token = await ethers.deployContract('TokenMock', ['TKN', 18])
                      })

                      beforeEach('set intent params', async () => {
                        transferIntentParams.transfers = [{ token, amount, recipient: other.address }]
                        transferIntentParams.feeToken = token
                        transferIntentParams.feeAmount = feeAmount
                      })

                      beforeEach('mint and approve tokens', async () => {
                        const totalAmount = amount + feeAmount

                        await token.mint(user.address, totalAmount)
                        await token.connect(user).approve(settler.target, totalAmount)
                      })

                      const itReverts = (reason: string) => {
                        it('reverts', async () => {
                          const intent = createTransferIntent({ ...intentParams, ...transferIntentParams })
                          const proposal = createTransferProposal({ ...proposalParams, ...transferProposalParams })
                          const signature = await signProposal(settler, intent, solver, proposal, admin)

                          await expect(
                            settler.execute([{ intent, proposal, signature }])
                          ).to.be.revertedWithCustomError(settler, reason)
                        })
                      }

                      context('when the chain is the current chain', () => {
                        beforeEach('set chain', () => {
                          transferIntentParams.chainId = 31337
                        })

                        context('when no recipient is the settler', () => {
                          beforeEach('set recipient', () => {
                            toArray(transferIntentParams.transfers).forEach((transfer) => {
                              transfer.recipient = other
                            })
                          })

                          context('when the proposal fee amount is greater than the intent fee amount', () => {
                            beforeEach('set proposal amount', async () => {
                              transferProposalParams.feeAmount = transferIntentParams.feeAmount
                            })

                            it('executes successfully', async () => {
                              const intent = createTransferIntent({ ...intentParams, ...transferIntentParams })
                              const proposal = createTransferProposal({ ...proposalParams, ...transferProposalParams })
                              const signature = await signProposal(settler, intent, solver, proposal, admin)

                              const tx = await settler.execute([{ intent, proposal, signature }])

                              const settlerEvents = await settler.queryFilter(
                                settler.filters.Executed(),
                                tx.blockNumber
                              )
                              expect(settlerEvents).to.have.lengthOf(1)

                              const proposalHash = await settler.getProposalHash(proposal, intent, solver.address)
                              expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                            })
                          })

                          context('when the proposal fee amount is lower than the intent fee amount', () => {
                            beforeEach('set proposal amount', async () => {
                              transferProposalParams.feeAmount = feeAmount + 1n
                            })

                            itReverts('SettlerSolverFeeTooHigh')
                          })
                        })

                        context('when a recipient is the settler', () => {
                          beforeEach('set recipient', () => {
                            toArray(transferIntentParams.transfers).forEach((transfer) => {
                              transfer.recipient = settler
                            })
                          })

                          itReverts('SettlerInvalidRecipient')
                        })
                      })

                      context('when the chain is not the current chain', () => {
                        beforeEach('set chain', () => {
                          transferIntentParams.chainId = 1
                        })

                        itReverts('SettlerInvalidChain')
                      })
                    })

                    context('for call intents', () => {
                      const callIntentParams: Partial<CallIntent> = {}
                      const callProposalParams: Partial<CallProposal> = {}
                      let token: TokenMock

                      const feeAmount = fp(0.1)

                      beforeEach('set token', async () => {
                        token = await ethers.deployContract('TokenMock', ['TKN', 18])
                      })

                      beforeEach('set intent params', async () => {
                        const target = await ethers.deployContract('CallMock')
                        const data = target.interface.encodeFunctionData('call')

                        callIntentParams.calls = [{ target, data, value: 0 }]
                        callIntentParams.feeToken = token
                        callIntentParams.feeAmount = feeAmount
                      })

                      const itReverts = (reason: string) => {
                        it('reverts', async () => {
                          const intent = createCallIntent({ ...intentParams, ...callIntentParams })
                          const proposal = createCallProposal({ ...proposalParams, ...callProposalParams })
                          const signature = await signProposal(settler, intent, solver, proposal, admin)

                          await expect(
                            settler.execute([{ intent, proposal, signature }])
                          ).to.be.revertedWithCustomError(settler, reason)
                        })
                      }

                      context('when the chain is the current chain', () => {
                        beforeEach('set chain', () => {
                          callIntentParams.chainId = 31337
                        })

                        context('when the user is a smart account', () => {
                          beforeEach('set intent user', async () => {
                            intentParams.user = await ethers.deployContract('SmartAccount', [settler, owner])
                          })

                          beforeEach('mint tokens', async () => {
                            await token.mint(intentParams.user, feeAmount)
                            // no neeed to approve the settler
                          })

                          context('when the proposal fee amount is greater than the intent fee amount', () => {
                            beforeEach('set proposal amount', async () => {
                              callProposalParams.feeAmount = callIntentParams.feeAmount
                            })

                            it('executes successfully', async () => {
                              const intent = createCallIntent({ ...intentParams, ...callIntentParams })
                              const proposal = createCallProposal({ ...proposalParams, ...callProposalParams })
                              const signature = await signProposal(settler, intent, solver, proposal, admin)

                              const tx = await settler.execute([{ intent, proposal, signature }])

                              const settlerEvents = await settler.queryFilter(
                                settler.filters.Executed(),
                                tx.blockNumber
                              )
                              expect(settlerEvents).to.have.lengthOf(1)

                              const proposalHash = await settler.getProposalHash(proposal, intent, solver.address)
                              expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                            })
                          })

                          context('when the proposal fee amount is lower than the intent fee amount', () => {
                            beforeEach('set proposal amount', async () => {
                              callProposalParams.feeAmount = feeAmount + 1n
                            })

                            itReverts('SettlerSolverFeeTooHigh')
                          })
                        })

                        context('when the user is not a smart account', () => {
                          context('when the user is an EOA', () => {
                            beforeEach('set intent user', async () => {
                              intentParams.user = other
                            })

                            itReverts('SettlerUserNotSmartAccount')
                          })

                          context('when the user is another contract', () => {
                            beforeEach('set intent user', async () => {
                              intentParams.user = token
                            })

                            itReverts('SettlerUserNotSmartAccount')
                          })
                        })
                      })

                      context('when the chain is not the current chain', () => {
                        beforeEach('set chain', () => {
                          callIntentParams.chainId = 1
                        })

                        itReverts('SettlerInvalidChain')
                      })
                    })
                  })

                  context('when the proposal has not been signed properly', () => {
                    beforeEach('disallow proposal signer', async () => {
                      await controller.connect(admin).setAllowedProposalSigners([admin.address], [false])
                    })

                    it('reverts', async () => {
                      const intent = createIntent(intentParams)
                      const proposal = createProposal(proposalParams)
                      const signature = await signProposal(settler, intent, solver, proposal, admin)

                      await expect(settler.execute([{ intent, proposal, signature }])).to.be.revertedWithCustomError(
                        settler,
                        'SettlerProposalSignerNotAllowed'
                      )
                    })
                  })
                })

                context('when the proposal deadline has been reached', () => {
                  beforeEach('set deadline', async () => {
                    const now = await currentTimestamp()
                    proposalParams.deadline = now - BigInt(5 * 60)
                  })

                  itReverts('SettlerProposalPastDeadline')
                })
              })

              context('when the intent deadline has been reached', () => {
                beforeEach('set deadline', async () => {
                  const now = await currentTimestamp()
                  intentParams.deadline = now - BigInt(5 * 60)
                })

                itReverts('SettlerIntentPastDeadline')
              })
            })

            context('when the nonce has already been used', () => {
              const nonce = ONES_BYTES32

              beforeEach('use nonce once', async () => {
                intentParams.nonce = nonce
                const intent = createSwapIntent({ ...intentParams, deadline: MAX_UINT256 })
                const executor = await ethers.deployContract('EmptyExecutorMock')
                const proposal = createSwapProposal({ ...proposalParams, deadline: MAX_UINT256, executor })
                const signature = await signProposal(settler, intent, solver, proposal, admin)

                await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
                await settler.execute([{ intent, proposal, signature }])
              })

              itReverts('SettlerNonceAlreadyUsed')
            })
          })

          context('when the nonce is zero', () => {
            beforeEach('set nonce', async () => {
              intentParams.nonce = ZERO_BYTES32
            })

            itReverts('SettlerNonceZero')
          })
        })

        context('when the settler contract is not correct', () => {
          beforeEach('set settler', async () => {
            intentParams.settler = randomAddress()
          })

          itReverts('SettlerInvalidSettler')
        })
      })

      context('when the sender is not an allowed solver', () => {
        itReverts('SettlerSolverNotAllowed')
      })
    })

    context('use cases', () => {
      beforeEach('allow solver', async () => {
        await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
        await controller.connect(admin).setAllowedSolvers([solver.address], [true])
        settler = settler.connect(solver)
      })

      context('single intent', () => {
        let intent: Intent

        context('swap', () => {
          let recipient: HardhatEthersSigner

          beforeEach('set recipient', async () => {
            recipient = other
          })

          context('single-chain', () => {
            const sourceChain = 31337
            const destinationChain = 31337

            context('withdraw', () => {
              let executor: TransferExecutorMock

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('TransferExecutorMock')
              })

              context('single token', () => {
                let token: TokenMock

                const amount = fp(1)
                const minAmount = fp(0.99999)

                beforeEach('deploy token', async () => {
                  token = await ethers.deployContract('TokenMock', ['WETH', 18])
                })

                beforeEach('mint and approve tokens', async () => {
                  await token.mint(user.address, amount)
                  await token.connect(user).approve(settler.target, amount)
                })

                beforeEach('create intent', async () => {
                  intent = createSwapIntent({
                    settler,
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: { token, amount },
                    tokensOut: { token, minAmount, recipient },
                  })
                })

                it('executes the intent', async () => {
                  const preUserBalance = await token.balanceOf(user.address)
                  const preRecipientBalance = await token.balanceOf(recipient.address)
                  const preExecutorBalance = await token.balanceOf(executor.target)

                  const data = executor.interface.encodeFunctionData('transfer', [token.target, minAmount])
                  const proposal = createSwapProposal({ executor, data, amountsOut: minAmount })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute([{ intent, proposal, signature }])

                  const postUserBalance = await token.balanceOf(user.address)
                  expect(preUserBalance - postUserBalance).to.be.eq(amount)

                  const postRecipientBalance = await token.balanceOf(recipient.address)
                  expect(postRecipientBalance - preRecipientBalance).to.be.eq(minAmount)

                  const postExecutorBalance = await token.balanceOf(executor.target)
                  expect(postExecutorBalance - preExecutorBalance).to.be.eq(amount - minAmount)
                })
              })

              context('multi token', () => {
                let token1: TokenMock, token2: TokenMock

                const amount1 = fp(1)
                const amount2 = fp(2)
                const minAmountOut1 = fp(0.99999)
                const minAmountOut2 = fp(1.99999)

                beforeEach('deploy tokens', async () => {
                  token1 = await ethers.deployContract('TokenMock', ['TKN1', 18])
                  token2 = await ethers.deployContract('TokenMock', ['TKN2', 18])
                })

                beforeEach('mint and approve tokens', async () => {
                  await token1.mint(user.address, amount1)
                  await token1.connect(user).approve(settler.target, amount1)

                  await token2.mint(user.address, amount2)
                  await token2.connect(user).approve(settler.target, amount2)
                })

                beforeEach('create intent', async () => {
                  intent = createSwapIntent({
                    settler,
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: [
                      { token: token1, amount: amount1 },
                      { token: token2, amount: amount2 },
                    ],
                    tokensOut: [
                      { token: token1, minAmount: minAmountOut1, recipient },
                      { token: token2, minAmount: minAmountOut2, recipient },
                    ],
                  })
                })

                it('executes the intent', async () => {
                  const preUserBalance1 = await token1.balanceOf(user.address)
                  const preUserBalance2 = await token2.balanceOf(user.address)
                  const preRecipientBalance1 = await token1.balanceOf(recipient.address)
                  const preRecipientBalance2 = await token2.balanceOf(recipient.address)
                  const preExecutorBalance1 = await token1.balanceOf(executor.target)
                  const preExecutorBalance2 = await token2.balanceOf(executor.target)

                  const data = executor.interface.encodeFunctionData('transfers', [
                    token1.target,
                    minAmountOut1,
                    token2.target,
                    minAmountOut2,
                  ])
                  const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute([{ intent, proposal, signature }])

                  const postUserBalance1 = await token1.balanceOf(user.address)
                  expect(preUserBalance1 - postUserBalance1).to.be.eq(amount1)

                  const postRecipientBalance1 = await token1.balanceOf(recipient.address)
                  expect(postRecipientBalance1 - preRecipientBalance1).to.be.eq(minAmountOut1)

                  const postExecutorBalance1 = await token1.balanceOf(executor.target)
                  expect(postExecutorBalance1 - preExecutorBalance1).to.be.eq(amount1 - minAmountOut1)

                  const postUserBalance2 = await token2.balanceOf(user.address)
                  expect(preUserBalance2 - postUserBalance2).to.be.eq(amount2)

                  const postRecipientBalance2 = await token2.balanceOf(recipient.address)
                  expect(postRecipientBalance2 - preRecipientBalance2).to.be.eq(minAmountOut2)

                  const postExecutorBalance2 = await token2.balanceOf(executor.target)
                  expect(postExecutorBalance2 - preExecutorBalance2).to.be.eq(amount2 - minAmountOut2)
                })
              })
            })

            context('swap', () => {
              let executor: TransferExecutorMock

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('TransferExecutorMock')
              })

              context('single tokens', () => {
                let from: HardhatEthersSigner | SmartAccount
                let tokenIn: TokenMock | string, tokenOut: TokenMock | string

                const minAmountOut = fp(1) // WETH

                const _itExecutesTheIntent = (amountIn: BigNumberish) => {
                  beforeEach('create intent', async () => {
                    intent = createSwapIntent({
                      settler,
                      user: toAddress(from),
                      sourceChain,
                      destinationChain,
                      tokensIn: { token: tokenIn, amount: amountIn },
                      tokensOut: { token: tokenOut, minAmount: minAmountOut, recipient },
                    })
                  })

                  it('executes the intent', async () => {
                    const preBalanceIn = await balanceOf(tokenIn, intent.user)
                    const preBalanceOut = await balanceOf(tokenOut, recipient)

                    const data = executor.interface.encodeFunctionData('transfer', [toAddress(tokenOut), minAmountOut])
                    const proposal = createSwapProposal({ executor, data, amountsOut: minAmountOut })
                    const signature = await signProposal(settler, intent, solver, proposal, admin)
                    await settler.execute([{ intent, proposal, signature }])

                    const postBalanceIn = await balanceOf(tokenIn, intent.user)
                    expect(preBalanceIn - postBalanceIn).to.be.eq(amountIn)

                    const postBalanceOut = await balanceOf(tokenOut, recipient)
                    expect(postBalanceOut - preBalanceOut).to.be.eq(minAmountOut)
                  })
                }

                const itExecutesTheIntent = (amountIn: BigNumberish) => {
                  context('when the token out is an ERC20', () => {
                    beforeEach('deploy token out and fund executor', async () => {
                      tokenOut = await ethers.deployContract('TokenMock', ['WETH', 18])
                      await tokenOut.mint(executor.target, minAmountOut)
                    })

                    _itExecutesTheIntent(amountIn)
                  })

                  context('when the token out is the native token', () => {
                    beforeEach('set token out and fund executor', async () => {
                      tokenOut = NATIVE_TOKEN_ADDRESS
                      await owner.sendTransaction({ to: executor.target, value: minAmountOut })
                    })

                    _itExecutesTheIntent(amountIn)
                  })
                }

                context('when the user is a smart account', () => {
                  beforeEach('set from', async () => {
                    from = await ethers.deployContract('SmartAccount', [settler, owner])
                  })

                  context('when the token in is an ERC20', () => {
                    const amountIn = bn(3000 * 1e6) // USDC

                    beforeEach('deploy token in', async () => {
                      tokenIn = await ethers.deployContract('TokenMock', ['USDC', 6])
                    })

                    beforeEach('mint tokens', async () => {
                      await tokenIn.mint(from, amountIn)
                    })

                    itExecutesTheIntent(amountIn)
                  })

                  context('when the token in is the native token', () => {
                    const amountIn = fp(1.1) // ETH

                    beforeEach('set token in', async () => {
                      tokenIn = NATIVE_TOKEN_ADDRESS
                    })

                    beforeEach('fund user', async () => {
                      await owner.sendTransaction({ to: from, value: amountIn })
                    })

                    itExecutesTheIntent(amountIn)
                  })
                })

                context('when the user is not a smart account', () => {
                  const amountIn = bn(2900 * 1e6) // USDC

                  beforeEach('set from', async () => {
                    from = user
                  })

                  beforeEach('deploy token in', async () => {
                    tokenIn = await ethers.deployContract('TokenMock', ['USDC', 6])
                  })

                  beforeEach('mint and approve tokens', async () => {
                    await tokenIn.mint(from, amountIn)
                    await tokenIn.connect(from).approve(settler.target, amountIn)
                  })

                  itExecutesTheIntent(amountIn)
                })
              })

              context('multi token', () => {
                let tokenIn1: TokenMock, tokenIn2: TokenMock, tokenIn3: TokenMock
                let tokenOut1: TokenMock, tokenOut2: TokenMock | string

                const amountIn1 = fp(1)
                const amountIn2 = fp(2)
                const amountIn3 = fp(3)
                const minAmountOut1 = fp(0.99999)
                const minAmountOut2 = fp(1.99999)

                beforeEach('deploy tokens', async () => {
                  tokenIn1 = await ethers.deployContract('TokenMock', ['IN1', 18])
                  tokenIn2 = await ethers.deployContract('TokenMock', ['IN2', 18])
                  tokenIn3 = await ethers.deployContract('TokenMock', ['IN3', 18])
                })

                beforeEach('mint and approve tokens', async () => {
                  await tokenIn1.mint(user.address, amountIn1)
                  await tokenIn1.connect(user).approve(settler.target, amountIn1)

                  await tokenIn2.mint(user.address, amountIn2)
                  await tokenIn2.connect(user).approve(settler.target, amountIn2)

                  await tokenIn3.mint(user.address, amountIn3)
                  await tokenIn3.connect(user).approve(settler.target, amountIn3)
                })

                const itExecutesTheIntent = () => {
                  beforeEach('create intent', async () => {
                    intent = createSwapIntent({
                      settler,
                      user,
                      sourceChain,
                      destinationChain,
                      tokensIn: [
                        { token: tokenIn1, amount: amountIn1 },
                        { token: tokenIn2, amount: amountIn2 },
                        { token: tokenIn3, amount: amountIn3 },
                      ],
                      tokensOut: [
                        { token: tokenOut1, minAmount: minAmountOut1, recipient },
                        { token: tokenOut2, minAmount: minAmountOut2, recipient },
                      ],
                    })
                  })

                  it('executes the intent', async () => {
                    const preBalanceIn1 = await tokenIn1.balanceOf(user.address)
                    const preBalanceIn2 = await tokenIn2.balanceOf(user.address)
                    const preBalanceIn3 = await tokenIn3.balanceOf(user.address)
                    const preBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                    const preBalanceOut2 = await balanceOf(tokenOut2, recipient)

                    const data = executor.interface.encodeFunctionData('transfers', [
                      tokenOut1.target,
                      minAmountOut1,
                      toAddress(tokenOut2),
                      minAmountOut2,
                    ])
                    const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                    const signature = await signProposal(settler, intent, solver, proposal, admin)
                    await settler.execute([{ intent, proposal, signature }])

                    const postBalanceIn1 = await tokenIn1.balanceOf(user.address)
                    expect(preBalanceIn1 - postBalanceIn1).to.be.eq(amountIn1)

                    const postBalanceIn2 = await tokenIn2.balanceOf(user.address)
                    expect(preBalanceIn2 - postBalanceIn2).to.be.eq(amountIn2)

                    const postBalanceIn3 = await tokenIn3.balanceOf(user.address)
                    expect(preBalanceIn3 - postBalanceIn3).to.be.eq(amountIn3)

                    const postBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                    expect(postBalanceOut1 - preBalanceOut1).to.be.eq(minAmountOut1)

                    const postBalanceOut2 = await balanceOf(tokenOut2, recipient)
                    expect(postBalanceOut2 - preBalanceOut2).to.be.eq(minAmountOut2)
                  })
                }

                context('when the tokens out are ERC20 tokens', () => {
                  beforeEach('deploy tokens out and fund executor', async () => {
                    tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                    tokenOut2 = await ethers.deployContract('TokenMock', ['OUT2', 18])

                    await tokenOut1.mint(executor.target, minAmountOut1)
                    await tokenOut2.mint(executor.target, minAmountOut2)
                  })

                  itExecutesTheIntent()
                })

                context('when a token out is the native token', () => {
                  beforeEach('set tokens out and fund executor', async () => {
                    tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                    tokenOut2 = NATIVE_TOKEN_ADDRESS

                    await tokenOut1.mint(executor.target, minAmountOut1)
                    await owner.sendTransaction({ to: executor.target, value: minAmountOut2 })
                  })

                  itExecutesTheIntent()
                })
              })
            })
          })

          context('cross-chain', () => {
            context('single token', () => {
              const amount = fp(1)
              const minAmount = fp(0.99999)

              context('when executing on the source chain', () => {
                const sourceChain = 31337
                const destinationChain = 1

                let executor: EmptyExecutorMock
                let tokenIn: TokenMock
                const tokenOut = randomAddress() // forcing random address for another chain

                beforeEach('deploy and mint tokens in', async () => {
                  tokenIn = await ethers.deployContract('TokenMock', ['WETH', 18])
                  await tokenIn.mint(user.address, amount)
                  await tokenIn.connect(user).approve(settler.target, amount)
                })

                beforeEach('deploy executor mock', async () => {
                  executor = await ethers.deployContract('EmptyExecutorMock')
                  await controller.connect(admin).setAllowedExecutors([executor.target], [true])
                })

                beforeEach('create intent', async () => {
                  intent = createSwapIntent({
                    settler,
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: { token: tokenIn, amount },
                    tokensOut: { token: tokenOut, minAmount, recipient },
                  })
                })

                it('executes the intent', async () => {
                  const preUserBalance = await tokenIn.balanceOf(user.address)
                  const preExecutorBalance = await tokenIn.balanceOf(executor.target)

                  const proposal = createSwapProposal({ executor, amountsOut: minAmount })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute([{ intent, proposal, signature }])

                  const postUserBalance = await tokenIn.balanceOf(user.address)
                  expect(preUserBalance - postUserBalance).to.be.eq(amount)

                  const postExecutorBalance = await tokenIn.balanceOf(executor.target)
                  expect(postExecutorBalance - preExecutorBalance).to.be.eq(amount)
                })
              })

              context('when executing on the destination chain', () => {
                const sourceChain = 1
                const destinationChain = 31337

                let executor: TransferExecutorMock
                let tokenOut: TokenMock | string
                const tokenIn = randomAddress() // forcing random address for another chain

                beforeEach('deploy executor mock', async () => {
                  executor = await ethers.deployContract('TransferExecutorMock')
                  await controller.connect(admin).setAllowedExecutors([executor.target], [true])
                })

                const itExecutesTheIntent = () => {
                  beforeEach('create intent', async () => {
                    intent = createSwapIntent({
                      settler,
                      user,
                      sourceChain,
                      destinationChain,
                      tokensIn: { token: tokenIn, amount },
                      tokensOut: { token: tokenOut, minAmount, recipient },
                    })
                  })

                  it('executes the intent', async () => {
                    const preRecipientBalance = await balanceOf(tokenOut, recipient)

                    const data = executor.interface.encodeFunctionData('transfer', [toAddress(tokenOut), minAmount])
                    const proposal = createSwapProposal({ executor, data, amountsOut: minAmount })
                    const signature = await signProposal(settler, intent, solver, proposal, admin)
                    await settler.execute([{ intent, proposal, signature }])

                    const postRecipientBalance = await balanceOf(tokenOut, recipient)
                    expect(postRecipientBalance - preRecipientBalance).to.be.eq(minAmount)
                  })
                }

                context('when the token out is an ERC20', () => {
                  beforeEach('deploy token out and fund executor', async () => {
                    tokenOut = await ethers.deployContract('TokenMock', ['DAI', 18])
                    await tokenOut.mint(executor.target, minAmount)
                  })

                  itExecutesTheIntent()
                })

                context('when the token out is the native token', () => {
                  beforeEach('set token out and fund executor', async () => {
                    tokenOut = NATIVE_TOKEN_ADDRESS
                    await owner.sendTransaction({ to: executor.target, value: minAmount })
                  })

                  itExecutesTheIntent()
                })
              })
            })

            context('multi token', () => {
              const amountIn1 = fp(1)
              const amountIn2 = fp(2)
              const amountIn3 = fp(3)
              const minAmountOut1 = fp(0.99999)
              const minAmountOut2 = fp(1.99999)

              context('when executing on the source chain', () => {
                let executor: EmptyExecutorMock
                const sourceChain = 31337
                const destinationChain = 1

                let tokenIn1: TokenMock, tokenIn2: TokenMock, tokenIn3: TokenMock
                const tokenOut1 = randomAddress() // forcing random address for another chain
                const tokenOut2 = randomAddress() // forcing random address for another chain

                beforeEach('deploy and mint tokens in', async () => {
                  tokenIn1 = await ethers.deployContract('TokenMock', ['IN1', 18])
                  await tokenIn1.mint(user.address, amountIn1)
                  await tokenIn1.connect(user).approve(settler.target, amountIn1)

                  tokenIn2 = await ethers.deployContract('TokenMock', ['IN2', 18])
                  await tokenIn2.mint(user.address, amountIn2)
                  await tokenIn2.connect(user).approve(settler.target, amountIn2)

                  tokenIn3 = await ethers.deployContract('TokenMock', ['IN3', 18])
                  await tokenIn3.mint(user.address, amountIn3)
                  await tokenIn3.connect(user).approve(settler.target, amountIn3)
                })

                beforeEach('deploy executor mock', async () => {
                  executor = await ethers.deployContract('EmptyExecutorMock')
                  await controller.connect(admin).setAllowedExecutors([executor.target], [true])
                })

                beforeEach('create intent', async () => {
                  intent = createSwapIntent({
                    settler,
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: [
                      { token: tokenIn1, amount: amountIn1 },
                      { token: tokenIn2, amount: amountIn2 },
                      { token: tokenIn3, amount: amountIn3 },
                    ],
                    tokensOut: [
                      { token: tokenOut1, minAmount: minAmountOut1, recipient },
                      { token: tokenOut2, minAmount: minAmountOut2, recipient },
                    ],
                  })
                })

                it('executes the intent', async () => {
                  const preUserBalanceIn1 = await tokenIn1.balanceOf(user.address)
                  const preUserBalanceIn2 = await tokenIn2.balanceOf(user.address)
                  const preUserBalanceIn3 = await tokenIn3.balanceOf(user.address)
                  const preExecutorBalanceIn1 = await tokenIn1.balanceOf(executor.target)
                  const preExecutorBalanceIn2 = await tokenIn2.balanceOf(executor.target)
                  const preExecutorBalanceIn3 = await tokenIn3.balanceOf(executor.target)

                  const proposal = createSwapProposal({ executor, amountsOut: [minAmountOut1, minAmountOut2] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute([{ intent, proposal, signature }])

                  const postUserBalanceIn1 = await tokenIn1.balanceOf(user.address)
                  expect(preUserBalanceIn1 - postUserBalanceIn1).to.be.eq(amountIn1)

                  const postUserBalanceIn2 = await tokenIn2.balanceOf(user.address)
                  expect(preUserBalanceIn2 - postUserBalanceIn2).to.be.eq(amountIn2)

                  const postUserBalanceIn3 = await tokenIn3.balanceOf(user.address)
                  expect(preUserBalanceIn3 - postUserBalanceIn3).to.be.eq(amountIn3)

                  const postExecutorBalanceIn1 = await tokenIn1.balanceOf(executor.target)
                  expect(postExecutorBalanceIn1 - preExecutorBalanceIn1).to.be.eq(amountIn1)

                  const postExecutorBalanceIn2 = await tokenIn2.balanceOf(executor.target)
                  expect(postExecutorBalanceIn2 - preExecutorBalanceIn2).to.be.eq(amountIn2)

                  const postExecutorBalanceIn3 = await tokenIn3.balanceOf(executor.target)
                  expect(postExecutorBalanceIn3 - preExecutorBalanceIn3).to.be.eq(amountIn3)
                })
              })

              context('when executing on the destination chain', () => {
                let executor: TransferExecutorMock
                const sourceChain = 1
                const destinationChain = 31337

                let tokenOut1: TokenMock, tokenOut2: TokenMock | string
                const tokenIn1 = randomAddress() // forcing random address for another chain
                const tokenIn2 = randomAddress() // forcing random address for another chain
                const tokenIn3 = randomAddress() // forcing random address for another chain

                beforeEach('deploy executor mock', async () => {
                  executor = await ethers.deployContract('TransferExecutorMock')
                  await controller.connect(admin).setAllowedExecutors([executor.target], [true])
                })

                const itExecutesTheIntent = () => {
                  beforeEach('create intent', async () => {
                    intent = createSwapIntent({
                      settler,
                      user,
                      sourceChain,
                      destinationChain,
                      tokensIn: [
                        { token: tokenIn1, amount: amountIn1 },
                        { token: tokenIn2, amount: amountIn2 },
                        { token: tokenIn3, amount: amountIn3 },
                      ],
                      tokensOut: [
                        { token: tokenOut1, minAmount: minAmountOut1, recipient },
                        { token: tokenOut2, minAmount: minAmountOut2, recipient },
                      ],
                    })
                  })

                  it('executes the intent', async () => {
                    const preRecipientBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                    const preRecipientBalanceOut2 = await balanceOf(tokenOut2, recipient)

                    const data = executor.interface.encodeFunctionData('transfers', [
                      tokenOut1.target,
                      minAmountOut1,
                      toAddress(tokenOut2),
                      minAmountOut2,
                    ])
                    const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                    const signature = await signProposal(settler, intent, solver, proposal, admin)
                    await settler.execute([{ intent, proposal, signature }])

                    const postRecipientBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                    expect(postRecipientBalanceOut1 - preRecipientBalanceOut1).to.be.eq(minAmountOut1)

                    const postRecipientBalanceOut2 = await balanceOf(tokenOut2, recipient)
                    expect(postRecipientBalanceOut2 - preRecipientBalanceOut2).to.be.eq(minAmountOut2)
                  })
                }

                context('when the tokens out are ERC20 tokens', () => {
                  beforeEach('deploy tokens out and fund executor', async () => {
                    tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                    tokenOut2 = await ethers.deployContract('TokenMock', ['OUT2', 18])

                    await tokenOut1.mint(executor.target, minAmountOut1)
                    await tokenOut2.mint(executor.target, minAmountOut2)
                  })

                  itExecutesTheIntent()
                })

                context('when a token out is the native token', () => {
                  beforeEach('set tokens out and fund executor', async () => {
                    tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                    tokenOut2 = NATIVE_TOKEN_ADDRESS

                    await tokenOut1.mint(executor.target, minAmountOut1)
                    await owner.sendTransaction({ to: executor.target, value: minAmountOut2 })
                  })

                  itExecutesTheIntent()
                })
              })
            })
          })
        })

        context('transfer', () => {
          let recipient: HardhatEthersSigner

          beforeEach('set recipient', async () => {
            recipient = other
          })

          context('single token', () => {
            let from: HardhatEthersSigner | SmartAccount
            let token: TokenMock | string, feeToken: TokenMock | string

            const amount = fp(1)

            const itExecutesTheIntent = (feeAmount: BigNumberish) => {
              beforeEach('create intent', async () => {
                intent = createTransferIntent({
                  settler,
                  user: toAddress(from),
                  transfers: [{ token, amount, recipient }],
                  feeToken,
                  feeAmount,
                })
              })

              it('executes the intent', async () => {
                const preUserTokenBalance = await balanceOf(token, intent.user)
                const preUserFeeTokenBalance = await balanceOf(feeToken, intent.user)
                const preRecipientBalance = await balanceOf(token, recipient.address)
                const preSolverBalance = await balanceOf(feeToken, solver.address)

                const proposal = createTransferProposal({ feeAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                const tx = await settler.execute([{ intent, proposal, signature }])

                const postUserTokenBalance = await balanceOf(token, intent.user)
                if (toAddress(token) == toAddress(feeToken)) {
                  expect(preUserTokenBalance - postUserTokenBalance).to.be.eq(amount + feeAmount)
                } else {
                  const postUserFeeTokenBalance = await balanceOf(feeToken, intent.user)
                  expect(preUserTokenBalance - postUserTokenBalance).to.be.eq(amount)
                  expect(preUserFeeTokenBalance - postUserFeeTokenBalance).to.be.eq(feeAmount)
                }

                const postRecipientBalance = await balanceOf(token, recipient.address)
                expect(postRecipientBalance - preRecipientBalance).to.be.eq(amount)

                const postSolverBalance = await balanceOf(feeToken, solver.address)
                if (feeToken == NATIVE_TOKEN_ADDRESS) {
                  const txReceipt = await (await tx.getTransaction())?.wait()
                  const txCost = txReceipt ? txReceipt.gasUsed * txReceipt.gasPrice : 0n
                  expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount - txCost)
                } else {
                  expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
                }
              })
            }

            context('when the user is a smart account', () => {
              beforeEach('set intent user', async () => {
                from = await ethers.deployContract('SmartAccount', [settler, owner])
              })

              context('when the token is an ERC20', () => {
                beforeEach('deploy token', async () => {
                  token = await ethers.deployContract('TokenMock', ['WETH', 18])
                })

                context('when the fee token is the transfer token', () => {
                  const feeAmount = fp(0.2)

                  beforeEach('set fee token', async () => {
                    feeToken = token
                  })

                  beforeEach('mint tokens', async () => {
                    await token.mint(from, amount + feeAmount)
                  })

                  itExecutesTheIntent(feeAmount)
                })

                context('when the fee token is not the transfer token', () => {
                  const feeAmount = bn(0.01 * 1e6)

                  beforeEach('deploy token', async () => {
                    feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
                  })

                  beforeEach('mint tokens', async () => {
                    await token.mint(from, amount)
                    await feeToken.mint(from, feeAmount)
                  })

                  itExecutesTheIntent(feeAmount)
                })
              })

              context('when the token is the native token', () => {
                beforeEach('set token', async () => {
                  token = NATIVE_TOKEN_ADDRESS
                })

                context('when the fee token is the transfer token', () => {
                  const feeAmount = fp(0.02)

                  beforeEach('set fee token', async () => {
                    feeToken = token
                  })

                  beforeEach('fund user', async () => {
                    await owner.sendTransaction({ to: from, value: amount + feeAmount })
                  })

                  itExecutesTheIntent(feeAmount)
                })

                context('when the fee token is not the transfer token', () => {
                  const feeAmount = bn(0.1 * 1e6)

                  beforeEach('deploy token', async () => {
                    feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
                  })

                  beforeEach('fund user', async () => {
                    await owner.sendTransaction({ to: from, value: amount })
                    await feeToken.mint(from, feeAmount)
                  })

                  itExecutesTheIntent(feeAmount)
                })
              })
            })

            context('when the user is not a smart account', () => {
              beforeEach('set intent user', async () => {
                from = user
              })

              beforeEach('deploy token', async () => {
                token = await ethers.deployContract('TokenMock', ['WETH', 18])
              })

              context('when the fee token is the transfer token', () => {
                const feeAmount = fp(0.01)

                beforeEach('set fee token', async () => {
                  feeToken = token
                })

                beforeEach('mint and approve tokens', async () => {
                  const totalAmount = amount + feeAmount

                  await token.mint(user.address, totalAmount)
                  await token.connect(user).approve(settler.target, totalAmount)
                })

                itExecutesTheIntent(feeAmount)
              })

              context('when the fee token is not the transfer token', () => {
                const feeAmount = bn(0.2 * 1e6)

                beforeEach('deploy token', async () => {
                  feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
                })

                beforeEach('mint and approve tokens', async () => {
                  await token.mint(user.address, amount)
                  await token.connect(user).approve(settler.target, amount)

                  await feeToken.mint(user.address, feeAmount)
                  await feeToken.connect(user).approve(settler.target, feeAmount)
                })

                itExecutesTheIntent(feeAmount)
              })
            })
          })

          context('multi token', () => {
            let token1: TokenMock, token2: TokenMock

            const amount1 = fp(0.5)
            const amount2 = bn(2 * 1e6)
            const feeAmount = fp(0.05)

            beforeEach('deploy tokens', async () => {
              token1 = await ethers.deployContract('TokenMock', ['TKN1', 18])
              token2 = await ethers.deployContract('TokenMock', ['TKN2', 6])
            })

            beforeEach('mint and approve tokens', async () => {
              const totalAmount = amount1 + feeAmount * BigInt(2)
              await token1.mint(user.address, totalAmount)
              await token1.connect(user).approve(settler.target, totalAmount)

              await token2.mint(user.address, amount2)
              await token2.connect(user).approve(settler.target, amount2)
            })

            beforeEach('create intent', async () => {
              intent = createTransferIntent({
                settler,
                user,
                transfers: [
                  { token: token1, amount: amount1, recipient },
                  { token: token1, amount: feeAmount, recipient: user }, // has no impact
                  { token: token2, amount: amount2, recipient },
                ],
                feeToken: token1,
                feeAmount,
              })
            })

            it('executes the intent', async () => {
              const preUserBalance1 = await token1.balanceOf(user.address)
              const preUserBalance2 = await token2.balanceOf(user.address)
              const preRecipientBalance1 = await token1.balanceOf(recipient.address)
              const preRecipientBalance2 = await token2.balanceOf(recipient.address)
              const preSolverBalance = await token1.balanceOf(solver.address)

              const proposal = createTransferProposal({ feeAmount })
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              await settler.execute([{ intent, proposal, signature }])

              const postUserBalance1 = await token1.balanceOf(user.address)
              expect(preUserBalance1 - postUserBalance1).to.be.eq(amount1 + feeAmount)

              const postUserBalance2 = await token2.balanceOf(user.address)
              expect(preUserBalance2 - postUserBalance2).to.be.eq(amount2)

              const postRecipientBalance1 = await token1.balanceOf(recipient.address)
              expect(postRecipientBalance1 - preRecipientBalance1).to.be.eq(amount1)

              const postRecipientBalance2 = await token2.balanceOf(recipient.address)
              expect(postRecipientBalance2 - preRecipientBalance2).to.be.eq(amount2)

              const postSolverBalance = await token1.balanceOf(solver.address)
              expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
            })
          })
        })

        context('call', () => {
          context('single call', () => {
            let target: Account, data: string
            let user: SmartAccount
            let feeToken: TokenMock | string

            const feeAmount = fp(0.01)

            beforeEach('deploy smart account', async () => {
              user = await ethers.deployContract('SmartAccount', [settler.target, owner.address])
            })

            context('when the target is not the settler', () => {
              beforeEach('set target', async () => {
                target = await ethers.deployContract('CallMock')
              })

              context('when the call succeeds', () => {
                beforeEach('set data', async () => {
                  data = target.interface.encodeFunctionData('call')
                })

                const _itExecutesTheIntent = (value: BigNumberish) => {
                  beforeEach('create intent', async () => {
                    intent = createCallIntent({
                      settler,
                      user,
                      calls: [{ target: target.target, data, value }],
                      feeToken,
                      feeAmount,
                    })
                  })

                  it('executes the intent', async () => {
                    const preUserBalance = await balanceOf(feeToken, user.target)
                    const preSolverBalance = await balanceOf(feeToken, solver.address)
                    const preTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target.target)

                    const proposal = createCallProposal({ feeAmount })
                    const signature = await signProposal(settler, intent, solver, proposal, admin)
                    const tx = await settler.execute([{ intent, proposal, signature }])

                    const postUserBalance = await balanceOf(feeToken, user.target)
                    const extraAmount = feeToken == NATIVE_TOKEN_ADDRESS ? value : 0n
                    expect(preUserBalance - postUserBalance).to.be.eq(feeAmount + extraAmount)

                    const postSolverBalance = await balanceOf(feeToken, solver.address)
                    if (feeToken == NATIVE_TOKEN_ADDRESS) {
                      const txReceipt = await (await tx.getTransaction())?.wait()
                      const txCost = txReceipt ? txReceipt.gasUsed * txReceipt.gasPrice : 0n
                      expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount - txCost)
                    } else {
                      expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
                    }

                    const postTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target.target)
                    expect(postTargetBalance - preTargetBalance).to.be.eq(value)
                  })
                }

                const itExecutesTheIntent = () => {
                  context('when the value is 0', () => {
                    const value = 0n

                    _itExecutesTheIntent(value)
                  })

                  context('when the value is greater than 0', () => {
                    const value = fp(0.00001)

                    beforeEach('fund smart account', async () => {
                      await owner.sendTransaction({ to: user.target, value })
                    })

                    _itExecutesTheIntent(value)
                  })
                }

                context('when the fee token is an ERC20', () => {
                  beforeEach('deploy token', async () => {
                    feeToken = await ethers.deployContract('TokenMock', ['WETH', 18])
                  })

                  beforeEach('mint tokens', async () => {
                    await feeToken.mint(user.target, feeAmount)
                  })

                  itExecutesTheIntent()
                })

                context('when the fee token is the native token', () => {
                  beforeEach('set token', async () => {
                    feeToken = NATIVE_TOKEN_ADDRESS
                  })

                  beforeEach('fund smart account', async () => {
                    await owner.sendTransaction({ to: user.target, value: feeAmount + BigInt(2) })
                  })

                  itExecutesTheIntent()
                })
              })

              context('when the call fails', () => {
                beforeEach('set data', async () => {
                  data = target.interface.encodeFunctionData('callError')
                })

                beforeEach('create intent', async () => {
                  intent = createCallIntent({
                    settler,
                    user,
                    calls: [{ target: target.target, data, value: 0 }],
                    feeAmount,
                  })
                })

                it('reverts', async () => {
                  const proposal = createCallProposal({ feeAmount })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)

                  await expect(settler.execute([{ intent, proposal, signature }])).to.be.revertedWithCustomError(
                    target,
                    'CallError'
                  )
                })
              })
            })

            context('when the target is the settler', () => {
              beforeEach('set target', async () => {
                target = settler
              })

              beforeEach('allow user', async () => {
                await controller.connect(admin).setAllowedSolvers([user.target], [true])
              })

              beforeEach('set data', async () => {
                const intent = createCallIntent()
                const proposal = createCallProposal()
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                const executions = [{ intent, proposal, signature }]

                data = settler.interface.encodeFunctionData('execute', [executions])
              })

              beforeEach('create intent', async () => {
                intent = createCallIntent({
                  settler,
                  user,
                  calls: [{ target, data, value: 0 }],
                })
              })

              it('reverts', async () => {
                const proposal = createCallProposal({ feeAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)

                await expect(settler.execute([{ intent, proposal, signature }])).to.be.revertedWithCustomError(
                  settler,
                  'ReentrancyGuardReentrantCall'
                )
              })
            })
          })

          context('multi call', () => {
            let target1: Account, target2: Account
            let data: string
            let user: SmartAccount
            let feeToken: TokenMock

            const value1 = fp(1)
            const value2 = fp(2)
            const feeAmount = fp(0.01)

            beforeEach('deploy smart account', async () => {
              user = await ethers.deployContract('SmartAccount', [settler.target, owner.address])
            })

            beforeEach('set targets and data', async () => {
              target1 = await ethers.deployContract('CallMock')
              target2 = await ethers.deployContract('CallMock')
              data = target1.interface.encodeFunctionData('call')
            })

            beforeEach('deploy token', async () => {
              feeToken = await ethers.deployContract('TokenMock', ['WETH', 18])
            })

            beforeEach('mint tokens', async () => {
              await feeToken.mint(user.target, feeAmount)
            })

            beforeEach('fund smart account', async () => {
              await owner.sendTransaction({ to: user.target, value: value1 + value2 })
            })

            beforeEach('create intent', async () => {
              intent = createCallIntent({
                settler,
                user,
                calls: [
                  { target: target1.target, data, value: value1 },
                  { target: target2.target, data, value: value2 },
                  { target: target2.target, data, value: 0 },
                ],
                feeToken,
                feeAmount,
              })
            })

            it('executes the intent', async () => {
              const preUserBalance = await balanceOf(feeToken, user.target)
              const preSolverBalance = await balanceOf(feeToken, solver.address)
              const preTarget1Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target1.target)
              const preTarget2Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target2.target)

              const proposal = createCallProposal({ feeAmount })
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              await settler.execute([{ intent, proposal, signature }])

              const postUserBalance = await balanceOf(feeToken, user.target)
              expect(preUserBalance - postUserBalance).to.be.eq(feeAmount)

              const postSolverBalance = await balanceOf(feeToken, solver.address)
              expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)

              const postTarget1Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target1.target)
              expect(postTarget1Balance - preTarget1Balance).to.be.eq(value1)

              const postTarget2Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target2.target)
              expect(postTarget2Balance - preTarget2Balance).to.be.eq(value2)
            })

            it('calls the smart account contract', async () => {
              const proposal = createCallProposal({ feeAmount })
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              const tx = await settler.execute([{ intent, proposal, signature }])

              const events = await user.queryFilter(user.filters.Called(), tx.blockNumber)
              expect(events).to.have.lengthOf(3)

              const targets = [target1, target2, target2]
              const values = [value1, value2, 0]
              for (const [i, event] of events.entries()) {
                expect(event.args.target).to.equal(targets[i])
                expect(event.args.data).to.equal(data)
                expect(event.args.value).to.equal(values[i])
                expect(event.args.result).to.equal('0x')
              }
            })
          })
        })
      })

      context('multi intent', () => {
        let transferIntent: Intent, swapIntent: Intent, callIntent: Intent
        let smartAccount: SmartAccount
        let weth: TokenMock
        let executor: TransferExecutorMock, target: Account

        const eth = NATIVE_TOKEN_ADDRESS
        const amount = fp(5)
        const feeAmount = fp(0.1)
        const value = fp(0.5)

        beforeEach('set smart account', async () => {
          smartAccount = await ethers.deployContract('SmartAccount', [settler, owner])
        })

        beforeEach('set token', async () => {
          weth = await ethers.deployContract('TokenMock', ['WETH', 18])
        })

        beforeEach('set executor and target', async () => {
          executor = await ethers.deployContract('TransferExecutorMock')
          target = await ethers.deployContract('CallMock')
        })

        beforeEach('mint and approve tokens', async () => {
          await weth.mint(user, amount + feeAmount)
          await weth.connect(user).approve(settler, amount + feeAmount)
        })

        beforeEach('fund executor', async () => {
          await owner.sendTransaction({ to: executor, value: amount })
        })

        // Transfer WETH from user to smart account
        beforeEach('create transfer intent', async () => {
          transferIntent = createTransferIntent({
            settler,
            user,
            transfers: [{ token: weth, amount, recipient: smartAccount }],
            feeToken: weth,
            feeAmount,
          })
        })

        // Swap WETH for ETH in smart account
        beforeEach('create swap intent', async () => {
          swapIntent = createSwapIntent({
            settler,
            user: smartAccount,
            sourceChain: 31337,
            destinationChain: 31337,
            tokensIn: { token: weth, amount },
            tokensOut: { token: eth, minAmount: amount, recipient: smartAccount },
          })
        })

        // Call with value from smart account
        beforeEach('create call intent', async () => {
          const data = target.interface.encodeFunctionData('call')

          callIntent = createCallIntent({
            settler,
            user: smartAccount,
            calls: [{ target, data, value }],
            feeToken: eth,
            feeAmount,
          })
        })

        it('executes the intents', async () => {
          const preBalanceWethUser = await balanceOf(weth, user)
          const preBalanceEthSmartAccount = await balanceOf(eth, smartAccount)

          const transferProposal = createTransferProposal({ feeAmount })
          const transferSignature = await signProposal(settler, transferIntent, solver, transferProposal, admin)

          const data = executor.interface.encodeFunctionData('transfer', [eth, amount])
          const swapProposal = createSwapProposal({ executor, data, amountsOut: amount })
          const swapSignature = await signProposal(settler, swapIntent, solver, swapProposal, admin)

          const callProposal = createCallProposal({ feeAmount })
          const callSignature = await signProposal(settler, callIntent, solver, callProposal, admin)

          const executions = [
            { intent: transferIntent, proposal: transferProposal, signature: transferSignature },
            { intent: swapIntent, proposal: swapProposal, signature: swapSignature },
            { intent: callIntent, proposal: callProposal, signature: callSignature },
          ]

          const tx = await settler.execute(executions)

          const executorEvents = await executor.queryFilter(executor.filters.Transferred(), tx.blockNumber)
          expect(executorEvents).to.have.lengthOf(1)

          const targetEvents = await target.queryFilter(target.filters.CallReceived(), tx.blockNumber)
          expect(targetEvents).to.have.lengthOf(1)

          const settlerEvents = await settler.queryFilter(settler.filters.Executed(), tx.blockNumber)
          expect(settlerEvents).to.have.lengthOf(3)

          const postBalanceWethUser = await balanceOf(weth, user)
          expect(preBalanceWethUser - postBalanceWethUser).to.be.eq(amount + feeAmount)

          const postBalanceEthSmartAccount = await balanceOf(eth, smartAccount)
          expect(postBalanceEthSmartAccount - preBalanceEthSmartAccount).to.be.eq(amount - value - feeAmount)
        })
      })
    })
  })

  describe('simulate', () => {
    context('when the sender is an allowed solver', () => {
      beforeEach('allow solver', async () => {
        await controller.connect(admin).setAllowedSolvers([solver.address], [true])
        settler = settler.connect(solver)
      })

      context('when there is a single intent', () => {
        it('reverts', async () => {
          const intent = createSwapIntent({ settler })
          const proposal = createSwapProposal({ executor: await ethers.deployContract('EmptyExecutorMock') })
          const fakeProposalSig = await Wallet.createRandom().signMessage(getBytes('0x'))
          const executions = [{ intent, proposal, signature: fakeProposalSig }]

          await expect(settler.simulate(executions)).to.be.revertedWithCustomError(settler, 'SettlerSimulationSuccess')
        })
      })

      context('when there are multiple intents', () => {
        it('reverts', async () => {
          const proposal = createSwapProposal({ executor: await ethers.deployContract('EmptyExecutorMock') })
          const fakeProposalSig = await Wallet.createRandom().signMessage(getBytes('0x'))
          const executions = [
            { intent: createSwapIntent({ settler }), proposal, signature: fakeProposalSig },
            { intent: createSwapIntent({ settler }), proposal, signature: fakeProposalSig },
          ]

          await expect(settler.simulate(executions)).to.be.revertedWithCustomError(settler, 'SettlerSimulationSuccess')
        })
      })
    })

    context('when the sender is not an allowed solver', () => {
      it('reverts', async () => {
        const executions = [{ intent: createIntent(), proposal: createProposal(), signature: '0x' }]

        await expect(settler.simulate(executions)).to.be.revertedWithCustomError(settler, 'SettlerSolverNotAllowed')
      })
    })
  })

  describe('reentrancy guard', () => {
    let executor: ReentrantExecutorMock

    beforeEach('deploy executor mock', async () => {
      executor = await ethers.deployContract('ReentrantExecutorMock', [settler.target])
      await controller.connect(admin).setAllowedExecutors([executor.target], [true])
    })

    beforeEach('allow solvers and set sender', async () => {
      await controller.connect(admin).setAllowedSolvers([solver.address, executor.target], [true, true])
      settler = settler.connect(solver)
    })

    beforeEach('allow proposal signer', async () => {
      await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
    })

    it('reverts', async () => {
      const intent = createSwapIntent({ settler })
      const executions = [{ intent, proposal: createProposal(), signature: '0x' }]
      const data = executor.interface.encodeFunctionData('execute', [executions])
      const proposal = createSwapProposal({ executor, data })
      const signature = await signProposal(settler, intent, solver, proposal, admin)

      await expect(settler.execute([{ intent, proposal, signature }])).to.be.revertedWithCustomError(
        settler,
        'ReentrancyGuardReentrantCall'
      )
    })
  })
})
