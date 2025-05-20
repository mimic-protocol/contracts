import {
  Account,
  assertEvent,
  assertIndirectEvent,
  currentTimestamp,
  deploy,
  deployTokenMock,
  fp,
  getSigners,
  MAX_UINT256,
  NATIVE_TOKEN_ADDRESS,
  ONES_BYTES32,
  randomAddress,
  randomHex,
  toAddress,
  toArray,
  toUSDC,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from '@mimic-fi/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract, Wallet } from 'ethers'
import { arrayify } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

import itBehavesLikeOwnable from './behaviors/Ownable.behavior'
import {
  createIntent,
  createProposal,
  createSwapIntent,
  createSwapProposal,
  encodeIntent,
  encodeProposal,
  Intent,
  Proposal,
  signProposal,
  SwapIntent,
  SwapProposal,
} from './helpers'

describe('Settler', () => {
  let settler: Contract, controller: Contract
  let user: SignerWithAddress, other: SignerWithAddress
  let admin: SignerWithAddress, owner: SignerWithAddress, solver: SignerWithAddress

  beforeEach('deploy settler', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, owner, user, other, solver] = await getSigners()
    controller = await deploy('Controller', [admin.address, [], [], [], []])
    settler = await deploy('Settler', [controller.address, owner.address])
  })

  const balanceOf = (token: Contract | string, account: Account) => {
    const accountAddress = toAddress(account)
    return typeof token === 'string' ? ethers.provider.getBalance(accountAddress) : token.balanceOf(accountAddress)
  }

  describe('initialize', () => {
    it('has a reference to the controller', async () => {
      expect(await settler.controller()).to.be.equal(controller.address)
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
      expect(domain.verifyingContract).to.be.equal(settler.address)
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
      await owner.sendTransaction({ to: settler.address, value })

      expect(await ethers.provider.getBalance(settler.address)).to.be.equal(value)
    })
  })

  describe('rescueFunds', () => {
    let token: Contract | string
    const airdrop = fp(10)

    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(owner)
      })

      context('when the recipient is not zero', () => {
        let recipient: SignerWithAddress

        beforeEach('set recipient', () => {
          recipient = user
        })

        const itWorksProperly = (amount: BigNumber) => {
          it('transfers the tokens to the recipient', async () => {
            const preSettlerBalance = await balanceOf(token, settler)
            const preRecipientBalance = await balanceOf(token, recipient)

            await settler.rescueFunds(toAddress(token), recipient.address, amount)

            const postSettlerBalance = await balanceOf(token, settler)
            expect(postSettlerBalance).to.be.equal(preSettlerBalance.sub(amount))

            const postRecipientBalance = await balanceOf(token, recipient)
            expect(postRecipientBalance).to.be.equal(preRecipientBalance.add(amount))
          })

          it('emits an event', async () => {
            const tx = await settler.rescueFunds(toAddress(token), recipient.address, amount)

            await assertEvent(tx, 'FundsRescued', {
              token,
              amount,
              recipient,
            })
          })
        }

        context('when the token is an ERC20', () => {
          beforeEach('set token', async () => {
            token = await deployTokenMock('TKN', 18)
          })

          beforeEach('airdrop tokens', async () => {
            token.mint(settler.address, airdrop)
          })

          context('when the owner withdraws the whole balance', () => {
            const amount = airdrop

            itWorksProperly(amount)
          })

          context('when the owner withdraws some balance', () => {
            const amount = airdrop.div(2)

            itWorksProperly(amount)
          })
        })

        context('when the token is the native token', () => {
          beforeEach('set token', async () => {
            token = NATIVE_TOKEN_ADDRESS
          })

          beforeEach('airdrop tokens', async () => {
            await owner.sendTransaction({ to: settler.address, value: airdrop })
          })

          context('when the owner withdraws the whole balance', () => {
            const amount = airdrop

            itWorksProperly(amount)
          })

          context('when the owner withdraws some balance', () => {
            const amount = airdrop.div(3)

            itWorksProperly(amount)
          })
        })
      })

      context('when the recipient is zero', () => {
        const recipient = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(settler.rescueFunds(randomAddress(), recipient, 0)).to.be.revertedWith(
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
        await expect(settler.rescueFunds(ZERO_ADDRESS, ZERO_ADDRESS, 0)).to.be.revertedWith(
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
                  intentParams.deadline = now.add(100)
                })

                context('when the proposal deadline has not been reached', () => {
                  beforeEach('set proposal deadline', async () => {
                    const now = await currentTimestamp()
                    proposalParams.deadline = now.add(100)
                  })

                  context('when the proposal has been signed properly', () => {
                    beforeEach('allow proposal signer', async () => {
                      await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
                    })

                    context('for swap intents', () => {
                      const swapIntentParams: Partial<SwapIntent> = {}
                      const swapProposalParams: Partial<SwapProposal> = {}
                      let tokenIn: Contract, tokenOut: Contract, executor: Contract

                      const amountIn = fp(1)
                      const proposedAmountOut = amountIn.sub(1)
                      const minAmount = proposedAmountOut.sub(1)

                      beforeEach('set tokens', async () => {
                        tokenIn = await deployTokenMock('IN', 18)
                        tokenOut = await deployTokenMock('OUT', 18)
                        swapIntentParams.tokensIn = [{ token: tokenIn, amount: amountIn }]
                        swapIntentParams.tokensOut = [{ token: tokenOut, recipient: other, minAmount }]
                      })

                      beforeEach('set executor', async () => {
                        executor = await deploy('MintExecutorMock')
                        swapProposalParams.executor = executor
                      })

                      beforeEach('mint and approve tokens', async () => {
                        await tokenIn.mint(user.address, amountIn)
                        await tokenIn.connect(user).approve(settler.address, amountIn)
                      })

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
                                swapProposalParams.amountsOut = [minAmount.add(1)]
                              })

                              const itExecutesTheProposalSuccessfully = () => {
                                const itExecutesSuccessfully = (amountOut: BigNumber) => {
                                  const amountsOut = [amountOut]

                                  beforeEach('set proposal amounts and data', async () => {
                                    swapProposalParams.amountsOut = amountsOut
                                    swapProposalParams.data = executor.interface.encodeFunctionData('mint', [
                                      tokenOut.address,
                                      amountOut,
                                    ])
                                  })

                                  it('executes successfully', async () => {
                                    const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                                    const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                                    const signature = await signProposal(settler, intent, solver, proposal, admin)

                                    const tx = await settler.execute(intent, proposal, signature)

                                    await assertIndirectEvent(tx, executor.interface, 'Minted')
                                    const proposalHash = await settler.getProposalHash(proposal, intent, solver.address)
                                    await assertEvent(tx, 'Executed', { proposal: proposalHash })
                                  })
                                }

                                const itReverts = (reason: string, amountOut: BigNumber) => {
                                  beforeEach('set proposal amounts and data', async () => {
                                    swapProposalParams.data = executor.interface.encodeFunctionData('mint', [
                                      tokenOut.address,
                                      amountOut,
                                    ])
                                  })

                                  it('reverts', async () => {
                                    const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                                    const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                                    const signature = await signProposal(settler, intent, solver, proposal, admin)

                                    await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                                      reason
                                    )
                                  })
                                }

                                context('when the amount out is greater than the proposal amount', () => {
                                  const amountOut = proposedAmountOut.add(1)

                                  itExecutesSuccessfully(amountOut)
                                })

                                context('when the amount out is lower than the proposal amount', () => {
                                  const amountOut = proposedAmountOut.sub(1)

                                  if (destinationChain == 31337) {
                                    itReverts('SettlerAmountOutLtProposed', amountOut)
                                  } else itExecutesSuccessfully(amountOut)
                                })
                              }

                              context('when the executor is allowed', () => {
                                beforeEach('allow executor', async () => {
                                  await controller.connect(admin).setAllowedExecutors([executor.address], [true])
                                })

                                itExecutesTheProposalSuccessfully()
                              })

                              context('when the executor is not allowed', () => {
                                beforeEach('disallow executor', async () => {
                                  await controller.connect(admin).setAllowedExecutors([executor.address], [false])
                                })

                                if (sourceChain == destinationChain) {
                                  itExecutesTheProposalSuccessfully()
                                } else {
                                  it('reverts', async () => {
                                    const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                                    const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                                    const signature = await signProposal(settler, intent, solver, proposal, admin)

                                    await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                                      'SettlerExecutorNotAllowed'
                                    )
                                  })
                                }
                              })
                            })

                            context('when the proposal amount is lower than the min amount', () => {
                              beforeEach('set proposal amount', () => {
                                swapProposalParams.amountsOut = [minAmount.sub(1)]
                              })

                              it('reverts', async () => {
                                const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                                const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                                const signature = await signProposal(settler, intent, solver, proposal, admin)
                                await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                                  'SettlerProposedAmountLtMinAmount'
                                )
                              })
                            })
                          })

                          context('when a recipient is the settler', () => {
                            beforeEach('set recipient', () => {
                              toArray(swapIntentParams.tokensOut).forEach((tokenOut) => {
                                tokenOut.recipient = settler
                              })
                            })

                            it('reverts', async () => {
                              const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                              const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                              const signature = await signProposal(settler, intent, solver, proposal, admin)
                              await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                                'SettlerInvalidRecipient'
                              )
                            })
                          })
                        })

                        context('when the proposed amounts length is not correct', () => {
                          beforeEach('set proposed amounts', () => {
                            swapProposalParams.amountsOut = [minAmount, minAmount]
                          })

                          it('reverts', async () => {
                            const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                            const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                            const signature = await signProposal(settler, intent, solver, proposal, admin)
                            await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                              // eslint-disable-next-line no-secrets/no-secrets
                              'SettlerInvalidProposedAmounts'
                            )
                          })
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

                          it('reverts', async () => {
                            const intent = createSwapIntent({ ...intentParams, ...swapIntentParams })
                            const proposal = createSwapProposal({ ...proposalParams, ...swapProposalParams })
                            const signature = await signProposal(settler, intent, solver, proposal, admin)
                            await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                              'SettlerInvalidChain'
                            )
                          })
                        })
                      })
                    })

                    context.skip('for transfer intents', () => {
                      // TODO: implement
                    })

                    context.skip('for call intents', () => {
                      // TODO: implement
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
                      await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith(
                        'SettlerProposalSignerNotAllowed'
                      )
                    })
                  })
                })

                context('when the proposal deadline has been reached', () => {
                  beforeEach('set deadline', async () => {
                    const now = await currentTimestamp()
                    proposalParams.deadline = now.sub(1)
                  })

                  it('reverts', async () => {
                    const intent = createIntent(intentParams)
                    const proposal = createProposal(proposalParams)
                    await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith(
                      'SettlerProposalPastDeadline'
                    )
                  })
                })
              })

              context('when the intent deadline has been reached', () => {
                beforeEach('set deadline', async () => {
                  const now = await currentTimestamp()
                  intentParams.deadline = now.sub(1)
                })

                it('reverts', async () => {
                  const intent = createIntent(intentParams)
                  const proposal = createProposal(proposalParams)
                  await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith('SettlerIntentPastDeadline')
                })
              })
            })

            context('when the nonce has already been used', () => {
              const nonce = ONES_BYTES32

              beforeEach('use nonce once', async () => {
                intentParams.nonce = nonce
                const intent = createSwapIntent({ ...intentParams, deadline: MAX_UINT256 })
                const executor = await deploy('EmptyExecutorMock')
                const proposal = createSwapProposal({ ...proposalParams, deadline: MAX_UINT256, executor })
                const signature = await signProposal(settler, intent, solver, proposal, admin)

                await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
                await settler.execute(intent, proposal, signature)
              })

              it('reverts', async () => {
                const intent = createIntent(intentParams)
                const proposal = createProposal(proposalParams)
                await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith('SettlerNonceAlreadyUsed')
              })
            })
          })

          context('when the nonce is zero', () => {
            beforeEach('set nonce', async () => {
              intentParams.nonce = ZERO_BYTES32
            })

            it('reverts', async () => {
              const intent = createIntent(intentParams)
              const proposal = createProposal(proposalParams)
              await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith('SettlerNonceZero')
            })
          })
        })

        context('when the settler contract is not correct', () => {
          beforeEach('set settler', async () => {
            intentParams.settler = randomAddress()
          })

          it('reverts', async () => {
            const intent = createIntent(intentParams)
            const proposal = createProposal(proposalParams)
            await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith('SettlerInvalidSettler')
          })
        })
      })

      context('when the sender is not an allowed solver', () => {
        it('reverts', async () => {
          const intent = createIntent(intentParams)
          const proposal = createProposal(proposalParams)
          await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWith('SettlerSolverNotAllowed')
        })
      })
    })

    context('use cases', () => {
      let intent: Intent

      beforeEach('allow solver', async () => {
        await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
        await controller.connect(admin).setAllowedSolvers([solver.address], [true])
        settler = settler.connect(solver)
      })

      context('swap', () => {
        let recipient: SignerWithAddress

        beforeEach('set recipient', async () => {
          recipient = other
        })

        context('single-chain', () => {
          const sourceChain = 31337
          const destinationChain = 31337

          context('withdraw', () => {
            let executor: Contract

            beforeEach('deploy executor mock', async () => {
              executor = await deploy('TransferExecutorMock')
            })

            context('single token', () => {
              let token: Contract

              const amount = fp(1)
              const minAmount = fp(0.99999)

              beforeEach('deploy token', async () => {
                token = await deployTokenMock('WETH', 18)
              })

              beforeEach('mint and approve tokens', async () => {
                await token.mint(user.address, amount)
                await token.connect(user).approve(settler.address, amount)
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
                const preExecutorBalance = await token.balanceOf(executor.address)

                const data = executor.interface.encodeFunctionData('transfer', [token.address, minAmount])
                const proposal = createSwapProposal({ executor, data, amountsOut: minAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance = await token.balanceOf(user.address)
                expect(preUserBalance.sub(postUserBalance)).to.be.eq(amount)

                const postRecipientBalance = await token.balanceOf(recipient.address)
                expect(postRecipientBalance.sub(preRecipientBalance)).to.be.eq(minAmount)

                const postExecutorBalance = await token.balanceOf(executor.address)
                expect(postExecutorBalance.sub(preExecutorBalance)).to.be.eq(amount.sub(minAmount))
              })
            })

            context('multi token', () => {
              let token1: Contract, token2: Contract

              const amount1 = fp(1)
              const amount2 = fp(2)
              const minAmountOut1 = fp(0.99999)
              const minAmountOut2 = fp(1.99999)

              beforeEach('deploy tokens', async () => {
                token1 = await deployTokenMock('TKN1', 18)
                token2 = await deployTokenMock('TKN2', 18)
              })

              beforeEach('mint and approve tokens', async () => {
                await token1.mint(user.address, amount1)
                await token1.connect(user).approve(settler.address, amount1)

                await token2.mint(user.address, amount2)
                await token2.connect(user).approve(settler.address, amount2)
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
                const preExecutorBalance1 = await token1.balanceOf(executor.address)
                const preExecutorBalance2 = await token2.balanceOf(executor.address)

                const data = executor.interface.encodeFunctionData('transfers', [
                  token1.address,
                  minAmountOut1,
                  token2.address,
                  minAmountOut2,
                ])
                const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance1 = await token1.balanceOf(user.address)
                expect(preUserBalance1.sub(postUserBalance1)).to.be.eq(amount1)

                const postRecipientBalance1 = await token1.balanceOf(recipient.address)
                expect(postRecipientBalance1.sub(preRecipientBalance1)).to.be.eq(minAmountOut1)

                const postExecutorBalance1 = await token1.balanceOf(executor.address)
                expect(postExecutorBalance1.sub(preExecutorBalance1)).to.be.eq(amount1.sub(minAmountOut1))

                const postUserBalance2 = await token2.balanceOf(user.address)
                expect(preUserBalance2.sub(postUserBalance2)).to.be.eq(amount2)

                const postRecipientBalance2 = await token2.balanceOf(recipient.address)
                expect(postRecipientBalance2.sub(preRecipientBalance2)).to.be.eq(minAmountOut2)

                const postExecutorBalance2 = await token2.balanceOf(executor.address)
                expect(postExecutorBalance2.sub(preExecutorBalance2)).to.be.eq(amount2.sub(minAmountOut2))
              })
            })
          })

          context('swap', () => {
            let executor: Contract

            beforeEach('deploy executor mock', async () => {
              executor = await deploy('TransferExecutorMock')
            })

            context('single tokens', () => {
              let tokenIn: Contract, tokenOut: Contract | string

              const amountIn = toUSDC(2900) // USDC
              const minAmountOut = fp(1) // WETH

              beforeEach('deploy token in', async () => {
                tokenIn = await deployTokenMock('USDC', 6)
              })

              beforeEach('mint and approve tokens', async () => {
                await tokenIn.mint(user.address, amountIn)
                await tokenIn.connect(user).approve(settler.address, amountIn)
              })

              const itExecutesTheIntent = () => {
                beforeEach('create intent', async () => {
                  intent = createSwapIntent({
                    settler,
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: { token: tokenIn, amount: amountIn },
                    tokensOut: { token: tokenOut, minAmount: minAmountOut, recipient },
                  })
                })

                it('executes the intent', async () => {
                  const preBalanceIn = await tokenIn.balanceOf(user.address)
                  const preBalanceOut = await balanceOf(tokenOut, recipient)

                  const data = executor.interface.encodeFunctionData('transfer', [toAddress(tokenOut), minAmountOut])
                  const proposal = createSwapProposal({ executor, data, amountsOut: minAmountOut })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postBalanceIn = await tokenIn.balanceOf(user.address)
                  expect(preBalanceIn.sub(postBalanceIn)).to.be.eq(amountIn)

                  const postBalanceOut = await balanceOf(tokenOut, recipient)
                  expect(postBalanceOut.sub(preBalanceOut)).to.be.eq(minAmountOut)
                })
              }

              context('when the token out is an ERC20', () => {
                beforeEach('deploy token out and fund executor', async () => {
                  tokenOut = await deployTokenMock('WETH', 18)
                  await tokenOut.mint(executor.address, minAmountOut)
                })

                itExecutesTheIntent()
              })

              context('when the token out is the native token', () => {
                beforeEach('set token out and fund executor', async () => {
                  tokenOut = NATIVE_TOKEN_ADDRESS
                  await owner.sendTransaction({ to: executor.address, value: minAmountOut })
                })

                itExecutesTheIntent()
              })
            })

            context('multi token', () => {
              let tokenIn1: Contract, tokenIn2: Contract, tokenIn3: Contract
              let tokenOut1: Contract, tokenOut2: Contract | string

              const amountIn1 = fp(1)
              const amountIn2 = fp(2)
              const amountIn3 = fp(3)
              const minAmountOut1 = fp(0.99999)
              const minAmountOut2 = fp(1.99999)

              beforeEach('deploy tokens', async () => {
                tokenIn1 = await deployTokenMock('IN1', 18)
                tokenIn2 = await deployTokenMock('IN2', 18)
                tokenIn3 = await deployTokenMock('IN3', 18)
              })

              beforeEach('mint and approve tokens', async () => {
                await tokenIn1.mint(user.address, amountIn1)
                await tokenIn1.connect(user).approve(settler.address, amountIn1)

                await tokenIn2.mint(user.address, amountIn2)
                await tokenIn2.connect(user).approve(settler.address, amountIn2)

                await tokenIn3.mint(user.address, amountIn3)
                await tokenIn3.connect(user).approve(settler.address, amountIn3)
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
                    tokenOut1.address,
                    minAmountOut1,
                    toAddress(tokenOut2),
                    minAmountOut2,
                  ])
                  const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postBalanceIn1 = await tokenIn1.balanceOf(user.address)
                  expect(preBalanceIn1.sub(postBalanceIn1)).to.be.eq(amountIn1)

                  const postBalanceIn2 = await tokenIn2.balanceOf(user.address)
                  expect(preBalanceIn2.sub(postBalanceIn2)).to.be.eq(amountIn2)

                  const postBalanceIn3 = await tokenIn3.balanceOf(user.address)
                  expect(preBalanceIn3.sub(postBalanceIn3)).to.be.eq(amountIn3)

                  const postBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                  expect(postBalanceOut1.sub(preBalanceOut1)).to.be.eq(minAmountOut1)

                  const postBalanceOut2 = await balanceOf(tokenOut2, recipient)
                  expect(postBalanceOut2.sub(preBalanceOut2)).to.be.eq(minAmountOut2)
                })
              }

              context('when the tokens out are ERC20 tokens', () => {
                beforeEach('deploy tokens out and fund executor', async () => {
                  tokenOut1 = await deployTokenMock('OUT1', 18)
                  tokenOut2 = await deployTokenMock('OUT2', 18)

                  await tokenOut1.mint(executor.address, minAmountOut1)
                  await tokenOut2.mint(executor.address, minAmountOut2)
                })

                itExecutesTheIntent()
              })

              context('when a token out is the native token', () => {
                beforeEach('set tokens out and fund executor', async () => {
                  tokenOut1 = await deployTokenMock('OUT1', 18)
                  tokenOut2 = NATIVE_TOKEN_ADDRESS

                  await tokenOut1.mint(executor.address, minAmountOut1)
                  await owner.sendTransaction({ to: executor.address, value: minAmountOut2 })
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

              let executor: Contract
              let tokenIn: Contract
              const tokenOut = randomAddress() // forcing random address for another chain

              beforeEach('deploy and mint tokens in', async () => {
                tokenIn = await deployTokenMock('WETH', 18)
                await tokenIn.mint(user.address, amount)
                await tokenIn.connect(user).approve(settler.address, amount)
              })

              beforeEach('deploy executor mock', async () => {
                executor = await deploy('EmptyExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor.address], [true])
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
                const preExecutorBalance = await tokenIn.balanceOf(executor.address)

                const proposal = createSwapProposal({ executor, amountsOut: minAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance = await tokenIn.balanceOf(user.address)
                expect(preUserBalance.sub(postUserBalance)).to.be.eq(amount)

                const postExecutorBalance = await tokenIn.balanceOf(executor.address)
                expect(postExecutorBalance.sub(preExecutorBalance)).to.be.eq(amount)
              })
            })

            context('when executing on the destination chain', () => {
              const sourceChain = 1
              const destinationChain = 31337

              let executor: Contract
              let tokenOut: Contract | string
              const tokenIn = randomAddress() // forcing random address for another chain

              beforeEach('deploy executor mock', async () => {
                executor = await deploy('TransferExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor.address], [true])
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
                  await settler.execute(intent, proposal, signature)

                  const postRecipientBalance = await balanceOf(tokenOut, recipient)
                  expect(postRecipientBalance.sub(preRecipientBalance)).to.be.eq(minAmount)
                })
              }

              context('when the token out is an ERC20', () => {
                beforeEach('deploy token out and fund executor', async () => {
                  tokenOut = await deployTokenMock('DAI', 18)
                  await tokenOut.mint(executor.address, minAmount)
                })

                itExecutesTheIntent()
              })

              context('when the token out is the native token', () => {
                beforeEach('set token out and fund executor', async () => {
                  tokenOut = NATIVE_TOKEN_ADDRESS
                  await owner.sendTransaction({ to: executor.address, value: minAmount })
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
              let executor: Contract
              const sourceChain = 31337
              const destinationChain = 1

              let tokenIn1: Contract, tokenIn2: Contract, tokenIn3: Contract
              const tokenOut1 = randomAddress() // forcing random address for another chain
              const tokenOut2 = randomAddress() // forcing random address for another chain

              beforeEach('deploy and mint tokens in', async () => {
                tokenIn1 = await deployTokenMock('IN1', 18)
                await tokenIn1.mint(user.address, amountIn1)
                await tokenIn1.connect(user).approve(settler.address, amountIn1)

                tokenIn2 = await deployTokenMock('IN2', 18)
                await tokenIn2.mint(user.address, amountIn2)
                await tokenIn2.connect(user).approve(settler.address, amountIn2)

                tokenIn3 = await deployTokenMock('IN3', 18)
                await tokenIn3.mint(user.address, amountIn3)
                await tokenIn3.connect(user).approve(settler.address, amountIn3)
              })

              beforeEach('deploy executor mock', async () => {
                executor = await deploy('EmptyExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor.address], [true])
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
                const preExecutorBalanceIn1 = await tokenIn1.balanceOf(executor.address)
                const preExecutorBalanceIn2 = await tokenIn2.balanceOf(executor.address)
                const preExecutorBalanceIn3 = await tokenIn3.balanceOf(executor.address)

                const proposal = createSwapProposal({ executor, amountsOut: [minAmountOut1, minAmountOut2] })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalanceIn1 = await tokenIn1.balanceOf(user.address)
                expect(preUserBalanceIn1.sub(postUserBalanceIn1)).to.be.eq(amountIn1)

                const postUserBalanceIn2 = await tokenIn2.balanceOf(user.address)
                expect(preUserBalanceIn2.sub(postUserBalanceIn2)).to.be.eq(amountIn2)

                const postUserBalanceIn3 = await tokenIn3.balanceOf(user.address)
                expect(preUserBalanceIn3.sub(postUserBalanceIn3)).to.be.eq(amountIn3)

                const postExecutorBalanceIn1 = await tokenIn1.balanceOf(executor.address)
                expect(postExecutorBalanceIn1.sub(preExecutorBalanceIn1)).to.be.eq(amountIn1)

                const postExecutorBalanceIn2 = await tokenIn2.balanceOf(executor.address)
                expect(postExecutorBalanceIn2.sub(preExecutorBalanceIn2)).to.be.eq(amountIn2)

                const postExecutorBalanceIn3 = await tokenIn3.balanceOf(executor.address)
                expect(postExecutorBalanceIn3.sub(preExecutorBalanceIn3)).to.be.eq(amountIn3)
              })
            })

            context('when executing on the destination chain', () => {
              let executor: Contract
              const sourceChain = 1
              const destinationChain = 31337

              let tokenOut1: Contract, tokenOut2: Contract | string
              const tokenIn1 = randomAddress() // forcing random address for another chain
              const tokenIn2 = randomAddress() // forcing random address for another chain
              const tokenIn3 = randomAddress() // forcing random address for another chain

              beforeEach('deploy executor mock', async () => {
                executor = await deploy('TransferExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor.address], [true])
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
                    tokenOut1.address,
                    minAmountOut1,
                    toAddress(tokenOut2),
                    minAmountOut2,
                  ])
                  const proposal = createSwapProposal({ executor, data, amountsOut: [minAmountOut1, minAmountOut2] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postRecipientBalanceOut1 = await tokenOut1.balanceOf(recipient.address)
                  expect(postRecipientBalanceOut1.sub(preRecipientBalanceOut1)).to.be.eq(minAmountOut1)

                  const postRecipientBalanceOut2 = await balanceOf(tokenOut2, recipient)
                  expect(postRecipientBalanceOut2.sub(preRecipientBalanceOut2)).to.be.eq(minAmountOut2)
                })
              }

              context('when the tokens out are ERC20 tokens', () => {
                beforeEach('deploy tokens out and fund executor', async () => {
                  tokenOut1 = await deployTokenMock('OUT1', 18)
                  tokenOut2 = await deployTokenMock('OUT2', 18)

                  await tokenOut1.mint(executor.address, minAmountOut1)
                  await tokenOut2.mint(executor.address, minAmountOut2)
                })

                itExecutesTheIntent()
              })

              context('when a token out is the native token', () => {
                beforeEach('set tokens out and fund executor', async () => {
                  tokenOut1 = await deployTokenMock('OUT1', 18)
                  tokenOut2 = NATIVE_TOKEN_ADDRESS

                  await tokenOut1.mint(executor.address, minAmountOut1)
                  await owner.sendTransaction({ to: executor.address, value: minAmountOut2 })
                })

                itExecutesTheIntent()
              })
            })
          })
        })
      })

      context.skip('transfer', () => {
        // TODO: implement
      })

      context.skip('call', () => {
        // TODO: implement
      })
    })
  })

  describe('simulate', () => {
    context('when the sender is an allowed solver', () => {
      beforeEach('allow solver', async () => {
        await controller.connect(admin).setAllowedSolvers([solver.address], [true])
        settler = settler.connect(solver)
      })

      it('reverts', async () => {
        const intent = createSwapIntent({ settler })
        const proposal = createSwapProposal({ executor: await deploy('EmptyExecutorMock') })
        const fakeProposalSig = await Wallet.createRandom().signMessage(arrayify('0x'))

        const reason = await expect(settler.simulate(intent, proposal, fakeProposalSig)).to.be.reverted
        expect(reason).to.match(/SettlerSimulationSuccess\(\d+\)/)
      })
    })

    context('when the sender is not an allowed solver', () => {
      it('reverts', async () => {
        await expect(settler.simulate(createIntent(), createProposal(), '0x')).to.be.revertedWith(
          'SettlerSolverNotAllowed'
        )
      })
    })
  })

  describe('reentrancy guard', () => {
    let executor: Contract

    beforeEach('deploy executor mock', async () => {
      executor = await deploy('ReentrantExecutorMock', [settler.address])
      await controller.connect(admin).setAllowedExecutors([executor.address], [true])
    })

    beforeEach('allow solvers and set sender', async () => {
      await controller.connect(admin).setAllowedSolvers([solver.address, executor.address], [true, true])
      settler = settler.connect(solver)
    })

    beforeEach('allow proposal signer', async () => {
      await controller.connect(admin).setAllowedProposalSigners([admin.address], [true])
    })

    it('reverts', async () => {
      const intent = createSwapIntent({ settler })
      const data = executor.interface.encodeFunctionData('execute', [intent, createProposal(), '0x'])
      const proposal = createSwapProposal({ executor, data })
      const signature = await signProposal(settler, intent, solver, proposal, admin)

      await expect(settler.execute(intent, proposal, signature)).to.be.revertedWith('ReentrancyGuardReentrantCall')
    })
  })
})
