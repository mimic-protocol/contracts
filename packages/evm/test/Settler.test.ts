import {
  BigNumberish,
  fp,
  MAX_UINT256,
  NATIVE_TOKEN_ADDRESS,
  ONES_BYTES32,
  Operation,
  OpType,
  randomEvmAddress,
  randomHex,
  randomSig,
  USD_ADDRESS,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { AbiCoder, getBytes, Wallet } from 'ethers'
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
  CallOperation,
  CallProposal,
  createCallIntent,
  createCallOperation,
  createCallProposal,
  createCrossChainSwapIntent,
  createCrossChainSwapOperation,
  createDynamicCallIntent,
  createDynamicCallOperation,
  createDynamicCallProposal,
  createIntent,
  createProposal,
  createSwapIntent,
  createSwapOperation,
  createSwapProposal,
  createTransferIntent,
  createTransferOperation,
  createTransferProposal,
  currentTimestamp,
  DynamicCallOperation,
  hashIntent,
  hashProposal,
  Intent,
  literal,
  Proposal,
  signProposal,
  staticCall,
  SwapOperation,
  SwapProposal,
  toAddress,
  toArray,
  TransferOperation,
  TransferProposal,
  variable,
} from './helpers'
import { addValidations } from './helpers/validations'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('Settler', () => {
  let settler: Settler, controller: Controller
  let user: HardhatEthersSigner, other: HardhatEthersSigner
  let admin: HardhatEthersSigner, owner: HardhatEthersSigner, solver: HardhatEthersSigner

  beforeEach('deploy settler', async () => {
    // eslint-disable-next-line prettier/prettier
    [, admin, owner, user, other, solver] = await ethers.getSigners()
    controller = await ethers.deployContract('Controller', [admin, [], [], [], [], 0])
    settler = await ethers.deployContract('Settler', [controller, owner])
  })

  const balanceOf = (token: TokenMock | string, account: Account) => {
    const accountAddress = toAddress(account)
    if (token == USD_ADDRESS) return 0n
    else if (token == NATIVE_TOKEN_ADDRESS) return ethers.provider.getBalance(accountAddress)
    else return token.balanceOf(accountAddress)
  }

  describe('initialize', () => {
    it('has a reference to the controller', async () => {
      expect(await settler.controller()).to.be.equal(controller)
    })

    it('has no operations validator', async () => {
      expect(await settler.operationsValidator()).to.be.equal(ZERO_ADDRESS)
    })

    it('has a smart accounts handler', async () => {
      expect(await settler.smartAccountsHandler()).to.not.be.equal(ZERO_ADDRESS)
    })

    it.skip('has a dynamic call decoder', async () => {
      expect(await settler.dynamicCallEncoder()).to.not.be.equal(ZERO_ADDRESS)
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
      expect(domain.verifyingContract).to.be.equal(settler)
      expect(domain.salt).to.be.equal(ZERO_BYTES32)
      expect(domain.extensions).to.be.empty
    })
  })

  describe('getIntentHash', () => {
    it('computes intents hashes correctly', async () => {
      const intent = createIntent()

      const intentHash = await settler.getIntentHash(intent)
      expect(intentHash).to.be.equal(hashIntent(intent))
    })
  })

  describe('getProposalHash', () => {
    it('computes proposal hashes correctly', async () => {
      const intent = createIntent()
      const proposal = createProposal()

      const proposalHash = await settler.getProposalHash(proposal, intent, solver)
      expect(proposalHash).to.be.equal(hashProposal(proposal, intent, solver))
    })
  })

  describe('receive', () => {
    const value = 1

    it('accepts native tokens', async () => {
      await owner.sendTransaction({ to: settler, value })

      expect(await ethers.provider.getBalance(settler)).to.be.equal(value)
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

            await settler.rescueFunds(toAddress(token), recipient, amount)

            const postSettlerBalance = await balanceOf(token, settler)
            expect(postSettlerBalance).to.be.eq(preSettlerBalance - amount)

            const postRecipientBalance = await balanceOf(token, recipient)
            expect(postRecipientBalance).to.be.equal(preRecipientBalance + amount)
          })

          it('emits an event', async () => {
            const tx = await settler.rescueFunds(toAddress(token), recipient, amount)

            const events = await settler.queryFilter(settler.filters.FundsRescued(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)

            expect(events[0].args.token).to.be.equal(token)
            expect(events[0].args.amount).to.be.equal(amount)
            expect(events[0].args.recipient).to.be.equal(recipient)
          })
        }

        context('when the token is an ERC20', () => {
          beforeEach('set token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
          })

          beforeEach('airdrop tokens', async () => {
            await token.mint(settler, airdrop)
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
            await owner.sendTransaction({ to: settler, value: airdrop })
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
          await expect(settler.rescueFunds(randomEvmAddress(), recipient, 0)).to.be.revertedWithCustomError(
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
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })

  describe('setSmartAccountsHandler', () => {
    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(owner)
      })

      context('when the smart accounts handler is not zero', () => {
        const newSmartAccountsHandler = randomEvmAddress()

        it('sets the smart accounts handler and emits an event', async () => {
          const tx = await settler.setSmartAccountsHandler(newSmartAccountsHandler)

          expect((await settler.smartAccountsHandler()).toLowerCase()).to.equal(newSmartAccountsHandler)

          const events = await settler.queryFilter(settler.filters.SmartAccountsHandlerSet(), tx.blockNumber)
          expect(events).to.have.lengthOf(1)
          expect(events[0].args.smartAccountsHandler.toLowerCase()).to.equal(newSmartAccountsHandler)
        })
      })

      context('when the smart accounts handler is zero', () => {
        const newSmartAccountsHandler = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(settler.setSmartAccountsHandler(newSmartAccountsHandler)).to.be.revertedWithCustomError(
            settler,
            'SmartAccountsHandlerZero'
          )
        })
      })
    })

    context('when the sender is not the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(user)
      })

      it('reverts', async () => {
        await expect(settler.setSmartAccountsHandler(ZERO_ADDRESS)).to.be.revertedWithCustomError(
          settler,
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })

  describe('setOperationsValidator', () => {
    const newValidator = randomEvmAddress()

    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(owner)
      })

      it('sets the operations validator and emits an event', async () => {
        const tx = await settler.setOperationsValidator(newValidator)

        expect((await settler.operationsValidator()).toLowerCase()).to.equal(newValidator)

        const events = await settler.queryFilter(settler.filters.OperationsValidatorSet(), tx.blockNumber)
        expect(events).to.have.lengthOf(1)
        expect(events[0].args.operationsValidator.toLowerCase()).to.equal(newValidator)
      })
    })

    context('when the sender is not the owner', () => {
      beforeEach('set sender', () => {
        settler = settler.connect(user)
      })

      it('reverts', async () => {
        await expect(settler.setOperationsValidator(newValidator)).to.be.revertedWithCustomError(
          settler,
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })

  describe('setSafeguard', () => {
    const safeguard = randomHex(64)

    beforeEach('set sender', () => {
      settler = settler.connect(user)
    })

    context('when the user had no safeguards', () => {
      it('sets the safeguard', async () => {
        const tx = await settler.setSafeguard(safeguard)

        const currentSafeguard = await settler.getUserSafeguard(user)
        expect(currentSafeguard).to.be.equal(safeguard)

        const events = await settler.queryFilter(settler.filters.SafeguardSet(), tx.blockNumber)
        expect(events).to.have.lengthOf(1)
        expect(events[0].args.user).to.equal(user)
      })
    })

    context('when the user already had safeguards', () => {
      const previousSafeguard = randomHex(64)

      beforeEach('set safeguard', async () => {
        await settler.setSafeguard(previousSafeguard)
      })

      it('replaces the previous safeguard', async () => {
        const tx = await settler.setSafeguard(safeguard)

        const currentSafeguard = await settler.getUserSafeguard(user)
        expect(currentSafeguard).to.be.equal(safeguard)
        expect(currentSafeguard).to.not.be.equal(previousSafeguard)

        const events = await settler.queryFilter(settler.filters.SafeguardSet(), tx.blockNumber)
        expect(events).to.have.lengthOf(1)
        expect(events[0].args.user).to.equal(user)
      })
    })
  })

  describe('execute', () => {
    context('validations', () => {
      const intentParams: Partial<Intent> = {}
      const proposalParams: Partial<Proposal> = {}

      const itReverts = (reason: string) => {
        it('reverts', async () => {
          const intent = createIntent(intentParams)
          const proposal = createProposal(proposalParams)

          await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWithCustomError(settler, reason)
        })
      }

      const itRevertsUnlessDestinationChain = (reason: string) => {
        context('when the intent is a swap', () => {
          context('when the swap is single-chain', () => {
            beforeEach('set intent operation', async () => {
              const operation = createSwapOperation({
                user: intentParams.feePayer,
                sourceChain: 31337,
                destinationChain: 31337,
                tokensIn: [],
                tokensOut: [],
              })
              intentParams.operations = [operation]
            })

            itReverts(reason)
          })

          context('when the swap is cross-chain', () => {
            context('when executing on the source chain', () => {
              beforeEach('set intent operation', async () => {
                const operation = createCrossChainSwapOperation({
                  user: intentParams.feePayer,
                  sourceChain: 31337,
                  destinationChain: 1,
                  tokensIn: [],
                  tokensOut: [],
                })
                intentParams.operations = [operation]
              })

              itReverts(reason)
            })

            context('when executing on the destination chain', () => {
              beforeEach('set intent operation', async () => {
                const operation = createCrossChainSwapOperation({
                  user: intentParams.feePayer,
                  sourceChain: 1,
                  destinationChain: 31337,
                  tokensIn: [],
                  tokensOut: [],
                })
                intentParams.operations = [operation]
              })

              it('does not validate the deadline', async () => {
                const intent = createIntent(intentParams)
                const proposal = createProposal(proposalParams)

                await expect(settler.execute(intent, proposal, '0x')).not.to.be.revertedWithCustomError(settler, reason)
              })
            })
          })
        })

        context('when the intent is a transfer', () => {
          beforeEach('set intent operation', async () => {
            const operation = createTransferOperation({
              user: intentParams.feePayer,
            })
            intentParams.operations = [operation]
          })

          itReverts(reason)
        })

        context('when the intent is a call', () => {
          beforeEach('set intent operation', async () => {
            const operation = createCallOperation({
              user: intentParams.feePayer,
            })
            intentParams.operations = [operation]
          })

          itReverts(reason)
        })
      }

      context('when the sender is an allowed solver', () => {
        beforeEach('allow solver and set sender', async () => {
          await controller.connect(admin).setAllowedSolvers([solver], [true])
          settler = settler.connect(solver)
        })

        context('when the settler contract is correct', () => {
          beforeEach('set settler', () => {
            intentParams.feePayer = user
            intentParams.settler = settler
          })

          context('when the nonce is not zero', () => {
            beforeEach('set nonce', () => {
              intentParams.nonce = randomHex(32)
            })

            context('when the intent hash has not been used', () => {
              context('when the operations are not empty', () => {
                context('when the proposal datas length matches the intent operations length', () => {
                  context('when the intent deadline has not been reached', () => {
                    beforeEach('set intent deadline', async () => {
                      const now = await currentTimestamp()
                      intentParams.deadline = now + BigInt(120 * 10)
                    })

                    context('when the proposal deadline has not been reached', () => {
                      beforeEach('set proposal deadline', async () => {
                        const now = await currentTimestamp()
                        proposalParams.deadline = now + BigInt(120 * 10)
                      })

                      context('when the proposal fee length is correct', () => {
                        let feeToken: TokenMock
                        const feeAmount = fp(0.1)

                        beforeEach('deploy fee token', async () => {
                          feeToken = await ethers.deployContract('TokenMock', ['TKN', 18])
                        })

                        beforeEach('set intent max fees', async () => {
                          intentParams.maxFees = [{ token: feeToken, amount: feeAmount }]
                        })

                        beforeEach('mint and approve fee tokens', async () => {
                          await feeToken.mint(user, feeAmount)
                          const allowance = await feeToken.allowance(user, settler)
                          await feeToken.connect(user).approve(settler, allowance + feeAmount)
                        })

                        context('when the proposal fee is lower than or equal to the intent max fee', () => {
                          beforeEach('set proposal fee', async () => {
                            proposalParams.fees = [feeAmount]
                          })

                          context(
                            'when the intent minimum validations is higher or equal than the controller minimum validations',
                            () => {
                              const validator1 = Wallet.createRandom()
                              const validator2 = Wallet.createRandom()
                              beforeEach('set min validations', async () => {
                                await controller.connect(admin).setMinValidations(1)
                                intentParams.minValidations = 2
                              })

                              beforeEach('set intent', async () => {
                                const futureIntent = createSwapIntent(intentParams, { user: intentParams.feePayer })
                                intentParams.triggerSig = randomSig()
                                intentParams.operations = futureIntent.operations
                                intentParams.events = []
                              })

                              context('when the validations are more or equal than the required validations', () => {
                                beforeEach('set intent validations', async () => {
                                  await addValidations(settler, intentParams, [validator1, validator2])
                                })

                                context('when the validators are allowed', () => {
                                  beforeEach('allow validators', async () => {
                                    await controller
                                      .connect(admin)
                                      .setAllowedValidators([validator1.address, validator2.address], [true, true])
                                  })

                                  context('when the validations are in order', () => {
                                    beforeEach('set intent validations in order', async () => {
                                      await addValidations(settler, intentParams, [validator1, validator2])
                                    })

                                    context('when the proposal has been signed properly', () => {
                                      beforeEach('allow proposal signer', async () => {
                                        await controller.connect(admin).setAllowedProposalSigners([admin], [true])
                                      })

                                      context('for single chain swap operations', () => {
                                        const swapOperationParams: Partial<SwapOperation> = {}
                                        const swapProposalParams: Partial<SwapProposal> = {}
                                        let tokenIn: TokenMock, tokenOut: TokenMock, executor: MintExecutorMock

                                        const amountIn = fp(1)
                                        const proposedAmountOut = amountIn - 1n
                                        const minAmount = proposedAmountOut - 1n

                                        beforeEach('set tokens', async () => {
                                          tokenIn = await ethers.deployContract('TokenMock', ['IN', 18])
                                          tokenOut = await ethers.deployContract('TokenMock', ['OUT', 18])
                                          swapOperationParams.tokensIn = [{ token: tokenIn, amount: amountIn }]
                                          swapOperationParams.tokensOut = [
                                            { token: tokenOut, recipient: other, minAmount },
                                          ]
                                        })

                                        beforeEach('set executor', async () => {
                                          executor = await ethers.deployContract('MintExecutorMock')
                                          swapProposalParams.executor = executor
                                        })

                                        beforeEach('mint and approve tokens', async () => {
                                          await tokenIn.mint(user, amountIn)
                                          await tokenIn.connect(user).approve(settler, amountIn)
                                          swapOperationParams.user = user
                                        })

                                        const itReverts = (reason: string) => {
                                          it('reverts', async () => {
                                            const intent = createSwapIntent(intentParams, swapOperationParams)
                                            await addValidations(settler, intent, [validator1, validator2])
                                            const proposal = createSwapProposal({
                                              ...proposalParams,
                                              ...swapProposalParams,
                                            })
                                            const signature = await signProposal(
                                              settler,
                                              intent,
                                              solver,
                                              proposal,
                                              admin
                                            )

                                            await expect(
                                              settler.execute(intent, proposal, signature)
                                            ).to.be.revertedWithCustomError(settler, reason)
                                          })
                                        }

                                        const itValidatesIntentsProperly = (
                                          sourceChain: number,
                                          destinationChain: number
                                        ) => {
                                          beforeEach('set source and destination chains', () => {
                                            swapOperationParams.sourceChain = sourceChain
                                            swapOperationParams.destinationChain = destinationChain
                                          })

                                          context('when the proposed amounts length is correct', () => {
                                            beforeEach('set proposed amounts', () => {
                                              swapProposalParams.amountsOut = [proposedAmountOut]
                                            })

                                            context('when no recipient is the settler', () => {
                                              beforeEach('set recipient', () => {
                                                toArray(swapOperationParams.tokensOut).forEach((tokenOut) => {
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
                                                      const intent = createSwapIntent(intentParams, swapOperationParams)

                                                      await addValidations(settler, intent, [validator1, validator2])
                                                      const proposal = createSwapProposal({
                                                        ...proposalParams,
                                                        ...swapProposalParams,
                                                      })
                                                      const signature = await signProposal(
                                                        settler,
                                                        intent,
                                                        solver,
                                                        proposal,
                                                        admin
                                                      )

                                                      const tx = await settler.execute(intent, proposal, signature)

                                                      const executorEvents = await executor.queryFilter(
                                                        executor.filters.Minted(),
                                                        tx.blockNumber
                                                      )
                                                      expect(executorEvents).to.have.lengthOf(1)

                                                      const settlerEvents = await settler.queryFilter(
                                                        settler.filters.ProposalExecuted(),
                                                        tx.blockNumber
                                                      )
                                                      expect(settlerEvents).to.have.lengthOf(1)

                                                      const proposalHash = await settler.getProposalHash(
                                                        proposal,
                                                        intent,
                                                        solver
                                                      )
                                                      expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                                                    })
                                                  }

                                                  context(
                                                    'when the amount out is greater than the proposal amount',
                                                    () => {
                                                      const amountOut = proposedAmountOut + 1n

                                                      beforeEach('set swap proposal data', async () => {
                                                        swapProposalParams.executorData =
                                                          AbiCoder.defaultAbiCoder().encode(
                                                            ['address[]', 'uint256[]'],
                                                            [[tokenOut.target], [amountOut]]
                                                          )
                                                      })

                                                      itExecutesSuccessfully()
                                                    }
                                                  )

                                                  context(
                                                    'when the amount out is lower than the proposal amount',
                                                    () => {
                                                      const amountOut = proposedAmountOut - 1n

                                                      beforeEach('set swap proposal data', async () => {
                                                        swapProposalParams.executorData =
                                                          AbiCoder.defaultAbiCoder().encode(
                                                            ['address[]', 'uint256[]'],
                                                            [[tokenOut.target], [amountOut]]
                                                          )
                                                      })

                                                      if (destinationChain == 31337)
                                                        itReverts('SettlerAmountOutLtProposed')
                                                      else itExecutesSuccessfully()
                                                    }
                                                  )
                                                }

                                                context('when the executor is allowed', () => {
                                                  beforeEach('allow executor', async () => {
                                                    await controller
                                                      .connect(admin)
                                                      .setAllowedExecutors([executor], [true])
                                                  })

                                                  itExecutesTheProposalSuccessfully()
                                                })

                                                context('when the executor is not allowed', () => {
                                                  beforeEach('disallow executor', async () => {
                                                    await controller
                                                      .connect(admin)
                                                      .setAllowedExecutors([executor], [false])
                                                  })

                                                  if (sourceChain == destinationChain)
                                                    itExecutesTheProposalSuccessfully()
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
                                                toArray(swapOperationParams.tokensOut).forEach((tokenOut) => {
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

                                            itReverts('SettlerInvalidProposedAmounts')
                                          })
                                        }

                                        context('when both chains are equal', () => {
                                          context('when chains are current chain', () => {
                                            itValidatesIntentsProperly(31337, 31337)
                                          })

                                          context('when chains are not current chain', () => {
                                            beforeEach('set chains', () => {
                                              swapOperationParams.sourceChain = 1
                                              swapOperationParams.destinationChain = 1
                                            })

                                            itReverts('SettlerInvalidChain')
                                          })
                                        })

                                        context('when both chains are different', () => {
                                          beforeEach('set chains', () => {
                                            swapOperationParams.sourceChain = 31337
                                            swapOperationParams.destinationChain = 1
                                          })

                                          itReverts('SettlerOperationChainsMismatch')
                                        })
                                      })

                                      context('for transfer operations', () => {
                                        const transferOperationParams: Partial<TransferOperation> = {}
                                        const transferProposalParams: Partial<TransferProposal> = {}
                                        let token: TokenMock

                                        const amount = fp(1)

                                        beforeEach('set token', async () => {
                                          token = await ethers.deployContract('TokenMock', ['TKN', 18])
                                        })

                                        beforeEach('set intent params', async () => {
                                          transferOperationParams.transfers = [{ token, amount, recipient: other }]
                                        })

                                        beforeEach('mint and approve tokens', async () => {
                                          await token.mint(user, amount)
                                          await token.connect(user).approve(settler, amount)
                                          transferOperationParams.user = user
                                        })

                                        const itReverts = (reason: string) => {
                                          it('reverts', async () => {
                                            const intent = createTransferIntent(intentParams, transferOperationParams)
                                            await addValidations(settler, intent, [validator1, validator2])
                                            const proposal = createTransferProposal({
                                              ...proposalParams,
                                              ...transferProposalParams,
                                            })
                                            const signature = await signProposal(
                                              settler,
                                              intent,
                                              solver,
                                              proposal,
                                              admin
                                            )

                                            await expect(
                                              settler.execute(intent, proposal, signature)
                                            ).to.be.revertedWithCustomError(settler, reason)
                                          })
                                        }

                                        context('when the chain is the current chain', () => {
                                          beforeEach('set chain', () => {
                                            transferOperationParams.chainId = 31337
                                          })

                                          context('when the proposal has some data', () => {
                                            beforeEach('set proposal data', () => {
                                              proposalParams.datas = ['0xab']
                                            })

                                            itReverts('SettlerProposalDataNotEmpty')
                                          })

                                          context('when the proposal has no data', () => {
                                            beforeEach('set proposal data', () => {
                                              proposalParams.datas = ['0x']
                                            })

                                            context('when the recipient is not the settler', () => {
                                              beforeEach('set recipient', () => {
                                                toArray(transferOperationParams.transfers).forEach((transfer) => {
                                                  transfer.recipient = other
                                                })
                                              })

                                              it('executes successfully', async () => {
                                                const intent = createTransferIntent(
                                                  intentParams,
                                                  transferOperationParams
                                                )
                                                await addValidations(settler, intent, [validator1, validator2])
                                                const proposal = createTransferProposal({
                                                  ...proposalParams,
                                                  ...transferProposalParams,
                                                })
                                                const signature = await signProposal(
                                                  settler,
                                                  intent,
                                                  solver,
                                                  proposal,
                                                  admin
                                                )

                                                const tx = await settler.execute(intent, proposal, signature)

                                                const settlerEvents = await settler.queryFilter(
                                                  settler.filters.ProposalExecuted(),
                                                  tx.blockNumber
                                                )
                                                expect(settlerEvents).to.have.lengthOf(1)

                                                const proposalHash = await settler.getProposalHash(
                                                  proposal,
                                                  intent,
                                                  solver
                                                )
                                                expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                                              })
                                            })

                                            context('when a recipient is the settler', () => {
                                              beforeEach('set recipient', () => {
                                                toArray(transferOperationParams.transfers).forEach((transfer) => {
                                                  transfer.recipient = settler
                                                })
                                              })

                                              itReverts('SettlerInvalidRecipient')
                                            })
                                          })
                                        })

                                        context('when the chain is not the current chain', () => {
                                          beforeEach('set chain', () => {
                                            transferOperationParams.chainId = 1
                                          })

                                          itReverts('SettlerInvalidChain')
                                        })
                                      })

                                      context('for call operations', () => {
                                        const callOperationParams: Partial<CallOperation> = {}
                                        const callProposalParams: Partial<CallProposal> = {}
                                        let token: TokenMock

                                        beforeEach('set token', async () => {
                                          token = await ethers.deployContract('TokenMock', ['TKN', 18])
                                        })

                                        beforeEach('set intent params', async () => {
                                          const target = await ethers.deployContract('CallMock')
                                          const data = target.interface.encodeFunctionData('call')

                                          callOperationParams.calls = [{ target, data, value: 0 }]
                                        })

                                        const itReverts = (reason: string) => {
                                          it('reverts', async () => {
                                            const intent = createCallIntent(intentParams, callOperationParams)
                                            await addValidations(settler, intent, [validator1, validator2])
                                            const proposal = createCallProposal({
                                              ...proposalParams,
                                              ...callProposalParams,
                                            })
                                            const signature = await signProposal(
                                              settler,
                                              intent,
                                              solver,
                                              proposal,
                                              admin
                                            )

                                            await expect(
                                              settler.execute(intent, proposal, signature)
                                            ).to.be.revertedWithCustomError(settler, reason)
                                          })
                                        }

                                        context('when the chain is the current chain', () => {
                                          beforeEach('set chain', () => {
                                            callOperationParams.chainId = 31337
                                          })

                                          context('when the proposal has some data', () => {
                                            beforeEach('set proposal data', () => {
                                              proposalParams.datas = ['0xab']
                                            })

                                            itReverts('SettlerProposalDataNotEmpty')
                                          })

                                          context('when no data is given', () => {
                                            beforeEach('set proposal data', () => {
                                              proposalParams.datas = ['0x']
                                            })

                                            context('when the user is a smart account', () => {
                                              beforeEach('set intent user', async () => {
                                                const smartAccountUser = await ethers.deployContract(
                                                  'SmartAccountContract',
                                                  [settler, owner]
                                                )
                                                intentParams.feePayer = smartAccountUser
                                                callOperationParams.user = smartAccountUser
                                                await feeToken.mint(intentParams.feePayer, feeAmount)
                                              })

                                              it('executes successfully', async () => {
                                                const intent = createCallIntent(intentParams, callOperationParams)
                                                await addValidations(settler, intent, [validator1, validator2])
                                                const proposal = createCallProposal({
                                                  ...proposalParams,
                                                  ...callProposalParams,
                                                })
                                                const signature = await signProposal(
                                                  settler,
                                                  intent,
                                                  solver,
                                                  proposal,
                                                  admin
                                                )

                                                const tx = await settler.execute(intent, proposal, signature)

                                                const settlerEvents = await settler.queryFilter(
                                                  settler.filters.ProposalExecuted(),
                                                  tx.blockNumber
                                                )
                                                expect(settlerEvents).to.have.lengthOf(1)

                                                const proposalHash = await settler.getProposalHash(
                                                  proposal,
                                                  intent,
                                                  solver
                                                )
                                                expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                                              })
                                            })

                                            context('when the user is not a smart account', () => {
                                              context('when the user is an EOA', () => {
                                                beforeEach('set intent user', async () => {
                                                  intentParams.feePayer = other
                                                  callOperationParams.user = other
                                                })

                                                itReverts('SettlerUserNotSmartAccount')
                                              })

                                              context('when the user is another contract', () => {
                                                beforeEach('set intent user', async () => {
                                                  intentParams.feePayer = token
                                                  callOperationParams.user = token
                                                })

                                                itReverts('SettlerUserNotSmartAccount')
                                              })
                                            })
                                          })
                                        })

                                        context('when the chain is not the current chain', () => {
                                          beforeEach('set chain', () => {
                                            callOperationParams.chainId = 1
                                          })

                                          itReverts('SettlerInvalidChain')
                                        })
                                      })

                                      context('for dynamic call operations', () => {
                                        const dynamicCallOperationParams: Partial<DynamicCallOperation> = {}
                                        const dynamicCallProposalParams: Partial<Proposal> = {}
                                        let token: TokenMock

                                        beforeEach('set token', async () => {
                                          token = await ethers.deployContract('TokenMock', ['TKN', 18])
                                        })

                                        beforeEach('set intent params', async () => {
                                          const target = await ethers.deployContract('StaticCallMock')
                                          dynamicCallOperationParams.calls = [
                                            {
                                              target,
                                              selector: target.interface.getFunction('returnUint')!.selector,
                                              arguments: [literal(['uint256'], [11n])],
                                            },
                                          ]
                                        })

                                        const itReverts = (reason: string) => {
                                          it('reverts', async () => {
                                            const intent = createDynamicCallIntent(
                                              intentParams,
                                              dynamicCallOperationParams
                                            )
                                            await addValidations(settler, intent, [validator1, validator2])
                                            const proposal = createDynamicCallProposal({
                                              ...proposalParams,
                                              ...dynamicCallProposalParams,
                                            })
                                            const signature = await signProposal(
                                              settler,
                                              intent,
                                              solver,
                                              proposal,
                                              admin
                                            )

                                            await expect(
                                              settler.execute(intent, proposal, signature)
                                            ).to.be.revertedWithCustomError(settler, reason)
                                          })
                                        }

                                        context('when the chain is the current chain', () => {
                                          beforeEach('set chain', () => {
                                            dynamicCallOperationParams.chainId = 31337
                                          })

                                          context('when the proposal has some data', () => {
                                            beforeEach('set proposal data', () => {
                                              dynamicCallProposalParams.datas = ['0xab']
                                            })

                                            itReverts('SettlerProposalDataNotEmpty')
                                          })

                                          context('when the user is a smart account', () => {
                                            beforeEach('set proposal data', () => {
                                              dynamicCallProposalParams.datas = ['0x']
                                            })

                                            beforeEach('set intent user', async () => {
                                              const smartAccountUser = await ethers.deployContract(
                                                'SmartAccountContract',
                                                [settler, owner]
                                              )
                                              intentParams.feePayer = smartAccountUser
                                              dynamicCallOperationParams.user = smartAccountUser
                                              await feeToken.mint(intentParams.feePayer, feeAmount)
                                            })

                                            it('executes successfully', async () => {
                                              const intent = createDynamicCallIntent(
                                                intentParams,
                                                dynamicCallOperationParams
                                              )
                                              await addValidations(settler, intent, [validator1, validator2])
                                              const proposal = createDynamicCallProposal({
                                                ...proposalParams,
                                                ...dynamicCallProposalParams,
                                              })
                                              const signature = await signProposal(
                                                settler,
                                                intent,
                                                solver,
                                                proposal,
                                                admin
                                              )

                                              const tx = await settler.execute(intent, proposal, signature)

                                              const settlerEvents = await settler.queryFilter(
                                                settler.filters.ProposalExecuted(),
                                                tx.blockNumber
                                              )
                                              expect(settlerEvents).to.have.lengthOf(1)

                                              const proposalHash = await settler.getProposalHash(
                                                proposal,
                                                intent,
                                                solver
                                              )
                                              expect(settlerEvents[0].args.proposal).to.be.equal(proposalHash)
                                            })
                                          })

                                          context('when the user is not a smart account', () => {
                                            beforeEach('set proposal data', () => {
                                              dynamicCallProposalParams.datas = ['0x']
                                            })

                                            context('when the user is an EOA', () => {
                                              beforeEach('set intent user', async () => {
                                                intentParams.feePayer = other
                                                dynamicCallOperationParams.user = other
                                              })

                                              itReverts('SettlerUserNotSmartAccount')
                                            })

                                            context('when the user is another contract', () => {
                                              beforeEach('set intent user', async () => {
                                                intentParams.feePayer = token
                                                dynamicCallOperationParams.user = token
                                              })

                                              itReverts('SettlerUserNotSmartAccount')
                                            })
                                          })
                                        })

                                        context('when the chain is not the current chain', () => {
                                          beforeEach('set chain', () => {
                                            dynamicCallOperationParams.chainId = 1
                                          })

                                          itReverts('SettlerInvalidChain')
                                        })
                                      })

                                      context('for cross chain swap operations', () => {
                                        const swapOperationParams: Partial<SwapOperation> = {}
                                        const swapProposalParams: Partial<SwapProposal> = {}
                                        let tokenIn: TokenMock, tokenOut: TokenMock, executor: MintExecutorMock

                                        const amountIn = fp(1)
                                        const proposedAmountOut = amountIn - 1n
                                        const minAmount = proposedAmountOut - 1n

                                        beforeEach('set tokens', async () => {
                                          tokenIn = await ethers.deployContract('TokenMock', ['IN', 18])
                                          tokenOut = await ethers.deployContract('TokenMock', ['OUT', 18])
                                          swapOperationParams.tokensIn = [{ token: tokenIn, amount: amountIn }]
                                          swapOperationParams.tokensOut = [
                                            { token: tokenOut, recipient: other, minAmount },
                                          ]
                                        })

                                        beforeEach('set executor', async () => {
                                          executor = await ethers.deployContract('MintExecutorMock')
                                          swapProposalParams.executor = executor
                                        })

                                        beforeEach('mint and approve tokens', async () => {
                                          await tokenIn.mint(user, amountIn)
                                          await tokenIn.connect(user).approve(settler, amountIn)
                                          swapOperationParams.user = user
                                        })

                                        const itReverts = (reason: string) => {
                                          it('reverts', async () => {
                                            const intent = createCrossChainSwapIntent(intentParams, swapOperationParams)
                                            await addValidations(settler, intent, [validator1, validator2])
                                            const proposal = createSwapProposal({
                                              ...proposalParams,
                                              ...swapProposalParams,
                                            })
                                            const signature = await signProposal(
                                              settler,
                                              intent,
                                              solver,
                                              proposal,
                                              admin
                                            )

                                            await expect(
                                              settler.execute(intent, proposal, signature)
                                            ).to.be.revertedWithCustomError(settler, reason)
                                          })
                                        }

                                        const itValidatesIntentsProperly = (
                                          sourceChain: number,
                                          destinationChain: number
                                        ) => {
                                          beforeEach('set source and destination chains', () => {
                                            swapOperationParams.sourceChain = sourceChain
                                            swapOperationParams.destinationChain = destinationChain
                                          })

                                          context('when there is only one cross chain swap', () => {
                                            context('when the proposed amounts length is correct', () => {
                                              beforeEach('set proposed amounts', () => {
                                                swapProposalParams.amountsOut = [proposedAmountOut]
                                              })

                                              context('when no recipient is the settler', () => {
                                                beforeEach('set recipient', () => {
                                                  toArray(swapOperationParams.tokensOut).forEach((tokenOut) => {
                                                    tokenOut.recipient = other
                                                  })
                                                })

                                                context(
                                                  'when the proposal amount is greater than the min amount',
                                                  () => {
                                                    beforeEach('set proposal amount', () => {
                                                      swapProposalParams.amountsOut = [minAmount + 1n]
                                                    })

                                                    const itExecutesTheProposalSuccessfully = () => {
                                                      const itExecutesSuccessfully = () => {
                                                        it('executes successfully', async () => {
                                                          const intent = createCrossChainSwapIntent(
                                                            intentParams,
                                                            swapOperationParams
                                                          )

                                                          await addValidations(settler, intent, [
                                                            validator1,
                                                            validator2,
                                                          ])
                                                          const proposal = createSwapProposal({
                                                            ...proposalParams,
                                                            ...swapProposalParams,
                                                          })
                                                          const signature = await signProposal(
                                                            settler,
                                                            intent,
                                                            solver,
                                                            proposal,
                                                            admin
                                                          )

                                                          const tx = await settler.execute(intent, proposal, signature)

                                                          const executorEvents = await executor.queryFilter(
                                                            executor.filters.Minted(),
                                                            tx.blockNumber
                                                          )
                                                          expect(executorEvents).to.have.lengthOf(1)

                                                          const settlerEvents = await settler.queryFilter(
                                                            settler.filters.ProposalExecuted(),
                                                            tx.blockNumber
                                                          )
                                                          expect(settlerEvents).to.have.lengthOf(1)

                                                          const proposalHash = await settler.getProposalHash(
                                                            proposal,
                                                            intent,
                                                            solver
                                                          )
                                                          expect(settlerEvents[0].args.proposal).to.be.equal(
                                                            proposalHash
                                                          )
                                                        })
                                                      }

                                                      context(
                                                        'when the amount out is greater than the proposal amount',
                                                        () => {
                                                          const amountOut = proposedAmountOut + 1n

                                                          beforeEach('set swap proposal data', async () => {
                                                            swapProposalParams.executorData =
                                                              AbiCoder.defaultAbiCoder().encode(
                                                                ['address[]', 'uint256[]'],
                                                                [[tokenOut.target], [amountOut]]
                                                              )
                                                          })

                                                          itExecutesSuccessfully()
                                                        }
                                                      )

                                                      context(
                                                        'when the amount out is lower than the proposal amount',
                                                        () => {
                                                          const amountOut = proposedAmountOut - 1n

                                                          beforeEach('set swap proposal data', async () => {
                                                            swapProposalParams.executorData =
                                                              AbiCoder.defaultAbiCoder().encode(
                                                                ['address[]', 'uint256[]'],
                                                                [[tokenOut.target], [amountOut]]
                                                              )
                                                          })

                                                          if (destinationChain == 31337)
                                                            itReverts('SettlerAmountOutLtProposed')
                                                          else itExecutesSuccessfully()
                                                        }
                                                      )
                                                    }

                                                    context('when the executor is allowed', () => {
                                                      beforeEach('allow executor', async () => {
                                                        await controller
                                                          .connect(admin)
                                                          .setAllowedExecutors([executor], [true])
                                                      })

                                                      itExecutesTheProposalSuccessfully()
                                                    })

                                                    context('when the executor is not allowed', () => {
                                                      beforeEach('disallow executor', async () => {
                                                        await controller
                                                          .connect(admin)
                                                          .setAllowedExecutors([executor], [false])
                                                      })

                                                      if (sourceChain == destinationChain)
                                                        itExecutesTheProposalSuccessfully()
                                                      else itReverts('SettlerExecutorNotAllowed')
                                                    })
                                                  }
                                                )

                                                context('when the proposal amount is lower than the min amount', () => {
                                                  beforeEach('set proposal amount', () => {
                                                    swapProposalParams.amountsOut = [minAmount - 1n]
                                                  })

                                                  itReverts('SettlerProposedAmountLtMinAmount')
                                                })
                                              })

                                              context('when a recipient is the settler', () => {
                                                beforeEach('set recipient', () => {
                                                  toArray(swapOperationParams.tokensOut).forEach((tokenOut) => {
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

                                              itReverts('SettlerInvalidProposedAmounts')
                                            })
                                          })

                                          context('when there is more than one operation', () => {
                                            let extraOperation: Operation

                                            beforeEach('set operation', () => {
                                              extraOperation = createTransferOperation()
                                            })

                                            it('reverts', async () => {
                                              const intent = createCrossChainSwapIntent(
                                                intentParams,
                                                swapOperationParams
                                              )
                                              intent.operations.push(extraOperation)
                                              await addValidations(settler, intent, [validator1, validator2])
                                              const proposal = createSwapProposal({
                                                ...proposalParams,
                                                ...swapProposalParams,
                                              })
                                              proposal.datas.push('0x')
                                              const signature = await signProposal(
                                                settler,
                                                intent,
                                                solver,
                                                proposal,
                                                admin
                                              )

                                              await expect(
                                                settler.execute(intent, proposal, signature)
                                              ).to.be.revertedWithCustomError(
                                                settler,
                                                'SettlerCrossChainSwapMustBeOnlyOperation'
                                              )
                                            })
                                          })
                                        }

                                        context('when both chains are different', () => {
                                          context('when the source chain is the current chain', () => {
                                            itValidatesIntentsProperly(31337, 1)
                                          })

                                          context('when the destination chain is the current chain', () => {
                                            itValidatesIntentsProperly(1, 31337)
                                          })
                                        })

                                        context('when both chains are equal', () => {
                                          beforeEach('set chains', () => {
                                            swapOperationParams.sourceChain = 1
                                            swapOperationParams.destinationChain = 1
                                          })

                                          itReverts('SettlerOperationChainsMismatch')
                                        })
                                      })
                                    })

                                    context('when the proposal has not been signed properly', () => {
                                      beforeEach('disallow proposal signer', async () => {
                                        await controller.connect(admin).setAllowedProposalSigners([admin], [false])
                                      })

                                      it('reverts', async () => {
                                        const intent = createIntent(intentParams)
                                        const proposal = createProposal(proposalParams)
                                        const signature = await signProposal(settler, intent, solver, proposal, admin)

                                        await expect(
                                          settler.execute(intent, proposal, signature)
                                        ).to.be.revertedWithCustomError(settler, 'SettlerProposalSignerNotAllowed')
                                      })
                                    })
                                  })

                                  context('when the validations are not in order', () => {
                                    beforeEach('set intent validations in disorder', async () => {
                                      await addValidations(settler, intentParams, [validator1, validator2])
                                      intentParams.validations = intentParams.validations?.reverse()
                                    })

                                    itReverts('SettlerValidatorDuplicatedOrUnsorted')
                                  })

                                  context('when the validations are the same', () => {
                                    beforeEach('set duplicate validations', async () => {
                                      await addValidations(settler, intentParams, [validator1, validator1])
                                    })
                                    itReverts('SettlerValidatorDuplicatedOrUnsorted')
                                  })
                                })

                                context('when the validators are not allowed', () => {
                                  itReverts('SettlerValidatorNotAllowed')
                                })
                              })

                              context('when the validations are less than the required validations', () => {
                                beforeEach('set intent validations', async () => {
                                  await addValidations(settler, intentParams, [validator2])
                                })
                                itReverts('SettlerIntentValidationsNotEnough')
                              })
                            }
                          )

                          context(
                            'when the intent minimum validations is less than the controller minimum validations',
                            () => {
                              beforeEach('set min validations', async () => {
                                intentParams.minValidations = 1
                                await controller.connect(admin).setMinValidations(2)
                              })

                              beforeEach('set intent', async () => {
                                const futureIntent = createSwapIntent(intentParams, { user: intentParams.feePayer })
                                intentParams.triggerSig = randomSig()
                                intentParams.operations = futureIntent.operations
                                intentParams.events = []
                              })

                              const validator1 = Wallet.createRandom()
                              const validator2 = Wallet.createRandom()

                              context('when the validations are more or equal than the required validations', () => {
                                beforeEach('set intent validations', async () => {
                                  await addValidations(settler, intentParams, [validator1, validator2])
                                })
                                itReverts('SettlerValidatorNotAllowed')
                              })

                              context('when the validations are less than the required validations', () => {
                                beforeEach('set intent validations', async () => {
                                  await addValidations(settler, intentParams, [validator2])
                                })
                                itReverts('SettlerIntentValidationsNotEnough')
                              })
                            }
                          )
                        })

                        context('when the proposal fee is greater than the intent max fee', () => {
                          beforeEach('set proposal fee', () => {
                            proposalParams.fees = [feeAmount + 1n]
                          })

                          itReverts('SettlerSolverFeeTooHigh')
                        })
                      })

                      context('when the proposal fee length is not correct', () => {
                        beforeEach('set proposal invalid fees', () => {
                          proposalParams.fees = []
                        })

                        itReverts('SettlerSolverFeeInvalidLength')
                      })
                    })

                    context('when the proposal deadline has been reached', () => {
                      beforeEach('set deadline', async () => {
                        const now = await currentTimestamp()
                        proposalParams.deadline = now - BigInt(5 * 60)
                      })

                      itRevertsUnlessDestinationChain('SettlerProposalPastDeadline')
                    })
                  })

                  context('when the intent deadline has been reached', () => {
                    beforeEach('set deadline', async () => {
                      const now = await currentTimestamp()
                      intentParams.deadline = now - BigInt(5 * 60)
                    })

                    itRevertsUnlessDestinationChain('SettlerIntentPastDeadline')
                  })
                })

                context('when the proposal datas length does not match the intent operations length', () => {
                  beforeEach('set data', () => {
                    intentParams.operations = [createTransferOperation()]
                    proposalParams.datas = [randomHex(32), randomHex(32)]
                  })

                  itReverts('SettlerProposalDataInvalidLength')
                })
              })

              context('when the operations are empty', () => {
                beforeEach('set operations', () => {
                  intentParams.operations = []
                })

                itReverts('SettlerIntentOperationsEmpty')
              })
            })

            context('when the intent has already been executed', () => {
              let intent: Intent
              let proposal: Proposal

              beforeEach('execute intent once', async () => {
                intentParams.maxFees = []
                intentParams.nonce = ONES_BYTES32
                intentParams.validations = []
                intentParams.minValidations = 0
                intentParams.deadline = MAX_UINT256

                intent = createSwapIntent(intentParams)
                const executor = await ethers.deployContract('EmptyExecutorMock')

                proposalParams.deadline = MAX_UINT256
                proposalParams.executor = toAddress(executor)

                proposal = createSwapProposal(proposalParams)
                const signature = await signProposal(settler, intent, solver, proposal, admin)

                await controller.connect(admin).setAllowedProposalSigners([admin], [true])
                await settler.execute(intent, proposal, signature)
              })

              it('reverts', async () => {
                await expect(settler.execute(intent, proposal, '0x')).to.be.revertedWithCustomError(
                  settler,
                  'SettlerIntentAlreadyExecuted'
                )
              })
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
            intentParams.settler = randomEvmAddress()
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
        await controller.connect(admin).setAllowedProposalSigners([admin], [true])
        await controller.connect(admin).setAllowedSolvers([solver], [true])
        settler = settler.connect(solver)
      })
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
                await token.mint(user, amount)
                await token.connect(user).approve(settler, amount)
              })

              beforeEach('create intent', async () => {
                intent = createSwapIntent(
                  {
                    settler,
                    feePayer: user,
                  },
                  {
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: { token, amount },
                    tokensOut: { token, minAmount, recipient },
                  }
                )
              })

              it('executes the intent', async () => {
                const preUserBalance = await token.balanceOf(user)
                const preRecipientBalance = await token.balanceOf(recipient)
                const preExecutorBalance = await token.balanceOf(executor)

                const executorData = AbiCoder.defaultAbiCoder().encode(
                  ['address[]', 'uint256[]'],
                  [[token.target], [minAmount]]
                )
                const proposal = createSwapProposal({ executor, executorData, amountsOut: minAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance = await token.balanceOf(user)
                expect(preUserBalance - postUserBalance).to.be.eq(amount)

                const postRecipientBalance = await token.balanceOf(recipient)
                expect(postRecipientBalance - preRecipientBalance).to.be.eq(minAmount)

                const postExecutorBalance = await token.balanceOf(executor)
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
                await token1.mint(user, amount1)
                await token1.connect(user).approve(settler, amount1)

                await token2.mint(user, amount2)
                await token2.connect(user).approve(settler, amount2)
              })

              beforeEach('create intent', async () => {
                intent = createSwapIntent(
                  {
                    settler,
                    feePayer: user,
                  },
                  {
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
                  }
                )
              })

              it('executes the intent', async () => {
                const preUserBalance1 = await token1.balanceOf(user)
                const preUserBalance2 = await token2.balanceOf(user)
                const preRecipientBalance1 = await token1.balanceOf(recipient)
                const preRecipientBalance2 = await token2.balanceOf(recipient)
                const preExecutorBalance1 = await token1.balanceOf(executor)
                const preExecutorBalance2 = await token2.balanceOf(executor)

                const amountsOut = [minAmountOut1, minAmountOut2]
                const executorData = AbiCoder.defaultAbiCoder().encode(
                  ['address[]', 'uint256[]'],
                  [
                    [token1.target, token2.target],
                    [minAmountOut1, minAmountOut2],
                  ]
                )
                const proposal = createSwapProposal({ executor, executorData, amountsOut })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance1 = await token1.balanceOf(user)
                expect(preUserBalance1 - postUserBalance1).to.be.eq(amount1)

                const postRecipientBalance1 = await token1.balanceOf(recipient)
                expect(postRecipientBalance1 - preRecipientBalance1).to.be.eq(minAmountOut1)

                const postExecutorBalance1 = await token1.balanceOf(executor)
                expect(postExecutorBalance1 - preExecutorBalance1).to.be.eq(amount1 - minAmountOut1)

                const postUserBalance2 = await token2.balanceOf(user)
                expect(preUserBalance2 - postUserBalance2).to.be.eq(amount2)

                const postRecipientBalance2 = await token2.balanceOf(recipient)
                expect(postRecipientBalance2 - preRecipientBalance2).to.be.eq(minAmountOut2)

                const postExecutorBalance2 = await token2.balanceOf(executor)
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
                const eventTopic = randomHex(32)
                const eventData = randomHex(120)

                beforeEach('create intent', async () => {
                  intent = createSwapIntent(
                    {
                      settler,
                      feePayer: toAddress(from),
                    },
                    {
                      user: toAddress(from),
                      sourceChain,
                      destinationChain,
                      tokensIn: { token: tokenIn, amount: amountIn },
                      tokensOut: { token: tokenOut, minAmount: minAmountOut, recipient },
                      events: [{ topic: eventTopic, data: eventData }],
                    }
                  )
                })

                it('executes the intent', async () => {
                  const preBalanceIn = await balanceOf(tokenIn, intent.feePayer)
                  const preBalanceOut = await balanceOf(tokenOut, recipient)

                  const executorData = AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'uint256[]'],
                    [[toAddress(tokenOut)], [minAmountOut]]
                  )
                  const proposal = createSwapProposal({ executor, executorData, amountsOut: minAmountOut })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postBalanceIn = await balanceOf(tokenIn, intent.feePayer)
                  expect(preBalanceIn - postBalanceIn).to.be.eq(amountIn)

                  const postBalanceOut = await balanceOf(tokenOut, recipient)
                  expect(postBalanceOut - preBalanceOut).to.be.eq(minAmountOut)
                })

                it('logs the intent events correctly', async () => {
                  const executorData = AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'uint256[]'],
                    [[toAddress(tokenOut)], [minAmountOut]]
                  )
                  const proposal = createSwapProposal({ executor, executorData, amountsOut: minAmountOut })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  const tx = await settler.execute(intent, proposal, signature)

                  const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
                  expect(events).to.have.lengthOf(1)

                  expect(events[0].args.user).to.be.equal(intent.operations[0].user)
                  expect(events[0].args.topic).to.be.equal(eventTopic)
                  expect(events[0].args.opType).to.be.equal(OpType.Swap)
                  expect(events[0].args.operation).to.not.be.undefined
                  expect(events[0].args.proposal).to.not.be.undefined
                  expect(events[0].args.intentHash).to.be.equal(hashIntent(intent))
                  expect(events[0].args.output).to.not.be.undefined
                  expect(events[0].args.data).to.be.equal(eventData)
                })
              }

              const itExecutesTheIntent = (amountIn: BigNumberish) => {
                context('when the token out is an ERC20', () => {
                  beforeEach('deploy token out and fund executor', async () => {
                    tokenOut = await ethers.deployContract('TokenMock', ['WETH', 18])
                    await tokenOut.mint(executor, minAmountOut)
                  })

                  _itExecutesTheIntent(amountIn)
                })

                context('when the token out is the native token', () => {
                  beforeEach('set token out and fund executor', async () => {
                    tokenOut = NATIVE_TOKEN_ADDRESS
                    await owner.sendTransaction({ to: executor, value: minAmountOut })
                  })

                  _itExecutesTheIntent(amountIn)
                })
              }

              context('when the user is a smart account', () => {
                beforeEach('set from', async () => {
                  from = await ethers.deployContract('SmartAccountContract', [settler, owner])
                })

                context('when the token in is an ERC20', () => {
                  const amountIn = BigInt(3000 * 1e6) // USDC

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
                const amountIn = BigInt(2900 * 1e6) // USDC

                beforeEach('set from', async () => {
                  from = user
                })

                beforeEach('deploy token in', async () => {
                  tokenIn = await ethers.deployContract('TokenMock', ['USDC', 6])
                })

                beforeEach('mint and approve tokens', async () => {
                  await tokenIn.mint(from, amountIn)
                  await tokenIn.connect(from).approve(settler, amountIn)
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
                await tokenIn1.mint(user, amountIn1)
                await tokenIn1.connect(user).approve(settler, amountIn1)

                await tokenIn2.mint(user, amountIn2)
                await tokenIn2.connect(user).approve(settler, amountIn2)

                await tokenIn3.mint(user, amountIn3)
                await tokenIn3.connect(user).approve(settler, amountIn3)
              })

              const itExecutesTheIntent = () => {
                beforeEach('create intent', async () => {
                  intent = createSwapIntent(
                    {
                      settler,
                      feePayer: user,
                    },
                    {
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
                    }
                  )
                })

                it('executes the intent', async () => {
                  const preBalanceIn1 = await tokenIn1.balanceOf(user)
                  const preBalanceIn2 = await tokenIn2.balanceOf(user)
                  const preBalanceIn3 = await tokenIn3.balanceOf(user)
                  const preBalanceOut1 = await tokenOut1.balanceOf(recipient)
                  const preBalanceOut2 = await balanceOf(tokenOut2, recipient)

                  const amountsOut = [minAmountOut1, minAmountOut2]
                  const executorData = AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'uint256[]'],
                    [
                      [tokenOut1.target, toAddress(tokenOut2)],
                      [minAmountOut1, minAmountOut2],
                    ]
                  )
                  const proposal = createSwapProposal({ executor, executorData, amountsOut })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postBalanceIn1 = await tokenIn1.balanceOf(user)
                  expect(preBalanceIn1 - postBalanceIn1).to.be.eq(amountIn1)

                  const postBalanceIn2 = await tokenIn2.balanceOf(user)
                  expect(preBalanceIn2 - postBalanceIn2).to.be.eq(amountIn2)

                  const postBalanceIn3 = await tokenIn3.balanceOf(user)
                  expect(preBalanceIn3 - postBalanceIn3).to.be.eq(amountIn3)

                  const postBalanceOut1 = await tokenOut1.balanceOf(recipient)
                  expect(postBalanceOut1 - preBalanceOut1).to.be.eq(minAmountOut1)

                  const postBalanceOut2 = await balanceOf(tokenOut2, recipient)
                  expect(postBalanceOut2 - preBalanceOut2).to.be.eq(minAmountOut2)
                })
              }

              context('when the tokens out are ERC20 tokens', () => {
                beforeEach('deploy tokens out and fund executor', async () => {
                  tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                  tokenOut2 = await ethers.deployContract('TokenMock', ['OUT2', 18])

                  await tokenOut1.mint(executor, minAmountOut1)
                  await tokenOut2.mint(executor, minAmountOut2)
                })

                itExecutesTheIntent()
              })

              context('when a token out is the native token', () => {
                beforeEach('set tokens out and fund executor', async () => {
                  tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                  tokenOut2 = NATIVE_TOKEN_ADDRESS

                  await tokenOut1.mint(executor, minAmountOut1)
                  await owner.sendTransaction({ to: executor, value: minAmountOut2 })
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
              const tokenOut = randomEvmAddress() // forcing random address for another chain

              beforeEach('deploy and mint tokens in', async () => {
                tokenIn = await ethers.deployContract('TokenMock', ['WETH', 18])
                await tokenIn.mint(user, amount)
                await tokenIn.connect(user).approve(settler, amount)
              })

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('EmptyExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor], [true])
              })

              beforeEach('create intent', async () => {
                intent = createCrossChainSwapIntent(
                  {
                    settler,
                    feePayer: user,
                  },
                  {
                    user,
                    sourceChain,
                    destinationChain,
                    tokensIn: { token: tokenIn, amount },
                    tokensOut: { token: tokenOut, minAmount, recipient },
                  }
                )
              })

              it('executes the intent', async () => {
                const preUserBalance = await tokenIn.balanceOf(user)
                const preExecutorBalance = await tokenIn.balanceOf(executor)

                const proposal = createSwapProposal({ executor, amountsOut: minAmount })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalance = await tokenIn.balanceOf(user)
                expect(preUserBalance - postUserBalance).to.be.eq(amount)

                const postExecutorBalance = await tokenIn.balanceOf(executor)
                expect(postExecutorBalance - preExecutorBalance).to.be.eq(amount)
              })
            })

            context('when executing on the destination chain', () => {
              const sourceChain = 1
              const destinationChain = 31337

              let executor: TransferExecutorMock
              let tokenOut: TokenMock | string
              const tokenIn = randomEvmAddress() // forcing random address for another chain

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('TransferExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor], [true])
              })

              const itExecutesTheIntent = () => {
                beforeEach('create intent', async () => {
                  intent = createCrossChainSwapIntent(
                    {
                      settler,
                      feePayer: user,
                    },
                    {
                      user,
                      sourceChain,
                      destinationChain,
                      tokensIn: { token: tokenIn, amount },
                      tokensOut: { token: tokenOut, minAmount, recipient },
                    }
                  )
                })

                it('executes the intent', async () => {
                  const preRecipientBalance = await balanceOf(tokenOut, recipient)

                  const executorData = AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'uint256[]'],
                    [[toAddress(tokenOut)], [minAmount]]
                  )
                  const proposal = createSwapProposal({ executor, executorData, amountsOut: minAmount })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postRecipientBalance = await balanceOf(tokenOut, recipient)
                  expect(postRecipientBalance - preRecipientBalance).to.be.eq(minAmount)
                })
              }

              context('when the token out is an ERC20', () => {
                beforeEach('deploy token out and fund executor', async () => {
                  tokenOut = await ethers.deployContract('TokenMock', ['DAI', 18])
                  await tokenOut.mint(executor, minAmount)
                })

                itExecutesTheIntent()
              })

              context('when the token out is the native token', () => {
                beforeEach('set token out and fund executor', async () => {
                  tokenOut = NATIVE_TOKEN_ADDRESS
                  await owner.sendTransaction({ to: executor, value: minAmount })
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
              const tokenOut1 = randomEvmAddress() // forcing random address for another chain
              const tokenOut2 = randomEvmAddress() // forcing random address for another chain

              beforeEach('deploy and mint tokens in', async () => {
                tokenIn1 = await ethers.deployContract('TokenMock', ['IN1', 18])
                await tokenIn1.mint(user, amountIn1)
                await tokenIn1.connect(user).approve(settler, amountIn1)

                tokenIn2 = await ethers.deployContract('TokenMock', ['IN2', 18])
                await tokenIn2.mint(user, amountIn2)
                await tokenIn2.connect(user).approve(settler, amountIn2)

                tokenIn3 = await ethers.deployContract('TokenMock', ['IN3', 18])
                await tokenIn3.mint(user, amountIn3)
                await tokenIn3.connect(user).approve(settler, amountIn3)
              })

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('EmptyExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor], [true])
              })

              beforeEach('create intent', async () => {
                intent = createCrossChainSwapIntent(
                  {
                    settler,
                    feePayer: user,
                  },
                  {
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
                  }
                )
              })

              it('executes the intent', async () => {
                const preUserBalanceIn1 = await tokenIn1.balanceOf(user)
                const preUserBalanceIn2 = await tokenIn2.balanceOf(user)
                const preUserBalanceIn3 = await tokenIn3.balanceOf(user)
                const preExecutorBalanceIn1 = await tokenIn1.balanceOf(executor)
                const preExecutorBalanceIn2 = await tokenIn2.balanceOf(executor)
                const preExecutorBalanceIn3 = await tokenIn3.balanceOf(executor)

                const proposal = createSwapProposal({ executor, amountsOut: [minAmountOut1, minAmountOut2] })
                const signature = await signProposal(settler, intent, solver, proposal, admin)
                await settler.execute(intent, proposal, signature)

                const postUserBalanceIn1 = await tokenIn1.balanceOf(user)
                expect(preUserBalanceIn1 - postUserBalanceIn1).to.be.eq(amountIn1)

                const postUserBalanceIn2 = await tokenIn2.balanceOf(user)
                expect(preUserBalanceIn2 - postUserBalanceIn2).to.be.eq(amountIn2)

                const postUserBalanceIn3 = await tokenIn3.balanceOf(user)
                expect(preUserBalanceIn3 - postUserBalanceIn3).to.be.eq(amountIn3)

                const postExecutorBalanceIn1 = await tokenIn1.balanceOf(executor)
                expect(postExecutorBalanceIn1 - preExecutorBalanceIn1).to.be.eq(amountIn1)

                const postExecutorBalanceIn2 = await tokenIn2.balanceOf(executor)
                expect(postExecutorBalanceIn2 - preExecutorBalanceIn2).to.be.eq(amountIn2)

                const postExecutorBalanceIn3 = await tokenIn3.balanceOf(executor)
                expect(postExecutorBalanceIn3 - preExecutorBalanceIn3).to.be.eq(amountIn3)
              })
            })

            context('when executing on the destination chain', () => {
              let executor: TransferExecutorMock
              const sourceChain = 1
              const destinationChain = 31337

              let tokenOut1: TokenMock, tokenOut2: TokenMock | string
              const tokenIn1 = randomEvmAddress() // forcing random address for another chain
              const tokenIn2 = randomEvmAddress() // forcing random address for another chain
              const tokenIn3 = randomEvmAddress() // forcing random address for another chain

              beforeEach('deploy executor mock', async () => {
                executor = await ethers.deployContract('TransferExecutorMock')
                await controller.connect(admin).setAllowedExecutors([executor], [true])
              })

              const itExecutesTheIntent = () => {
                beforeEach('create intent', async () => {
                  intent = createCrossChainSwapIntent(
                    {
                      settler,
                      feePayer: user,
                    },
                    {
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
                    }
                  )
                })

                it('executes the intent', async () => {
                  const preRecipientBalanceOut1 = await tokenOut1.balanceOf(recipient)
                  const preRecipientBalanceOut2 = await balanceOf(tokenOut2, recipient)

                  const amountsOut = [minAmountOut1, minAmountOut2]
                  const executorData = AbiCoder.defaultAbiCoder().encode(
                    ['address[]', 'uint256[]'],
                    [
                      [tokenOut1.target, toAddress(tokenOut2)],
                      [minAmountOut1, minAmountOut2],
                    ]
                  )
                  const proposal = createSwapProposal({ executor, executorData, amountsOut })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  await settler.execute(intent, proposal, signature)

                  const postRecipientBalanceOut1 = await tokenOut1.balanceOf(recipient)
                  expect(postRecipientBalanceOut1 - preRecipientBalanceOut1).to.be.eq(minAmountOut1)

                  const postRecipientBalanceOut2 = await balanceOf(tokenOut2, recipient)
                  expect(postRecipientBalanceOut2 - preRecipientBalanceOut2).to.be.eq(minAmountOut2)
                })
              }

              context('when the tokens out are ERC20 tokens', () => {
                beforeEach('deploy tokens out and fund executor', async () => {
                  tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                  tokenOut2 = await ethers.deployContract('TokenMock', ['OUT2', 18])

                  await tokenOut1.mint(executor, minAmountOut1)
                  await tokenOut2.mint(executor, minAmountOut2)
                })

                itExecutesTheIntent()
              })

              context('when a token out is the native token', () => {
                beforeEach('set tokens out and fund executor', async () => {
                  tokenOut1 = await ethers.deployContract('TokenMock', ['OUT1', 18])
                  tokenOut2 = NATIVE_TOKEN_ADDRESS

                  await tokenOut1.mint(executor, minAmountOut1)
                  await owner.sendTransaction({ to: executor, value: minAmountOut2 })
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
            const eventTopic = randomHex(32)
            const eventData = randomHex(120)

            beforeEach('create intent', async () => {
              intent = createTransferIntent(
                {
                  settler,
                  feePayer: toAddress(from),
                  maxFees: [{ token: feeToken, amount: feeAmount }],
                },
                {
                  user: toAddress(from),
                  transfers: [{ token, amount, recipient }],
                  events: [{ topic: eventTopic, data: eventData }],
                }
              )
            })

            it('executes the intent', async () => {
              const preUserTokenBalance = await balanceOf(token, intent.feePayer)
              const preUserFeeTokenBalance = await balanceOf(feeToken, intent.feePayer)
              const preRecipientBalance = await balanceOf(token, recipient)
              const preSolverBalance = await balanceOf(feeToken, solver)

              const proposal = createTransferProposal({ fees: [feeAmount] })
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              const tx = await settler.execute(intent, proposal, signature)

              const postUserTokenBalance = await balanceOf(token, intent.feePayer)
              if (toAddress(token) == toAddress(feeToken)) {
                expect(preUserTokenBalance - postUserTokenBalance).to.be.eq(amount + feeAmount)
              } else if (feeToken !== USD_ADDRESS) {
                const postUserFeeTokenBalance = await balanceOf(feeToken, intent.feePayer)
                expect(preUserTokenBalance - postUserTokenBalance).to.be.eq(amount)
                expect(preUserFeeTokenBalance - postUserFeeTokenBalance).to.be.eq(feeAmount)
              }

              const postRecipientBalance = await balanceOf(token, recipient)
              expect(postRecipientBalance - preRecipientBalance).to.be.eq(amount)

              const postSolverBalance = await balanceOf(feeToken, solver)
              if (feeToken == NATIVE_TOKEN_ADDRESS) {
                const txReceipt = await (await tx.getTransaction())?.wait()
                const txCost = txReceipt ? txReceipt.gasUsed * txReceipt.gasPrice : 0n
                expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount - txCost)
              } else if (feeToken !== USD_ADDRESS) {
                expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
              }
            })

            it('logs the intent events correctly', async () => {
              const proposal = createTransferProposal({ fees: [feeAmount] })
              const signature = await signProposal(settler, intent, solver, proposal, admin)
              const tx = await settler.execute(intent, proposal, signature)

              const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
              expect(events).to.have.lengthOf(1)

              expect(events[0].args.user).to.be.equal(intent.operations[0].user)
              expect(events[0].args.topic).to.be.equal(eventTopic)
              expect(events[0].args.opType).to.be.equal(OpType.Transfer)
              expect(events[0].args.operation).to.not.be.undefined
              expect(events[0].args.proposal).to.not.be.undefined
              expect(events[0].args.intentHash).to.be.equal(hashIntent(intent))
              expect(events[0].args.output).to.be.eq('0x')
              expect(events[0].args.data).to.be.equal(eventData)
            })
          }

          context('when the user is a smart account', () => {
            beforeEach('set intent user', async () => {
              from = await ethers.deployContract('SmartAccountContract', [settler, owner])
            })

            context('when the token is an ERC20', () => {
              beforeEach('deploy token', async () => {
                token = await ethers.deployContract('TokenMock', ['WETH', 18])
              })

              beforeEach('mint tokens', async () => {
                await token.mint(from, amount)
              })

              context('when the fee token is USD', () => {
                const feeAmount = fp(0.02)

                beforeEach('set fee token', async () => {
                  feeToken = USD_ADDRESS
                })

                itExecutesTheIntent(feeAmount)
              })

              context('when the fee token is the transfer token', () => {
                const feeAmount = fp(0.2)

                beforeEach('set fee token', async () => {
                  feeToken = token
                })

                beforeEach('mint fee tokens', async () => {
                  await token.mint(from, feeAmount)
                })

                itExecutesTheIntent(feeAmount)
              })

              context('when the fee token is another token', () => {
                const feeAmount = BigInt(0.01 * 1e6)

                beforeEach('deploy fee token', async () => {
                  feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
                })

                beforeEach('mint fee tokens', async () => {
                  await feeToken.mint(from, feeAmount)
                })

                itExecutesTheIntent(feeAmount)
              })
            })

            context('when the token is the native token', () => {
              beforeEach('set token', async () => {
                token = NATIVE_TOKEN_ADDRESS
              })

              beforeEach('fund user', async () => {
                await owner.sendTransaction({ to: from, value: amount })
              })

              context('when the fee token is USD', () => {
                const feeAmount = fp(0.02)

                beforeEach('set fee token', async () => {
                  feeToken = USD_ADDRESS
                })

                itExecutesTheIntent(feeAmount)
              })

              context('when the fee token is the native token', () => {
                const feeAmount = fp(0.02)

                beforeEach('set fee token', async () => {
                  feeToken = token
                })

                beforeEach('fund user for fees', async () => {
                  await owner.sendTransaction({ to: from, value: feeAmount })
                })

                itExecutesTheIntent(feeAmount)
              })

              context('when the fee token is another token', () => {
                const feeAmount = BigInt(0.1 * 1e6)

                beforeEach('deploy fee token', async () => {
                  feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
                })

                beforeEach('mint fee tokens', async () => {
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

            beforeEach('mint and approve tokens', async () => {
              await token.mint(user, amount)
              await token.connect(user).approve(settler, amount)
            })

            context('when the fee token is USD', () => {
              const feeAmount = fp(0.02)

              beforeEach('set fee token', async () => {
                feeToken = USD_ADDRESS
              })

              itExecutesTheIntent(feeAmount)
            })

            context('when the fee token is the transfer token', () => {
              const feeAmount = fp(0.01)

              beforeEach('set fee token', async () => {
                feeToken = token
              })

              beforeEach('mint and approve fee tokens', async () => {
                await token.mint(user, feeAmount)
                const allowance = await token.allowance(user, settler)
                await token.connect(user).approve(settler, allowance + feeAmount)
              })

              itExecutesTheIntent(feeAmount)
            })

            context('when the fee token is another token', () => {
              const feeAmount = BigInt(0.2 * 1e6)

              beforeEach('deploy token', async () => {
                feeToken = await ethers.deployContract('TokenMock', ['USDC', 6])
              })

              beforeEach('mint and approve tokens', async () => {
                await feeToken.mint(user, feeAmount)
                await feeToken.connect(user).approve(settler, feeAmount)
              })

              itExecutesTheIntent(feeAmount)
            })
          })
        })

        context('multi token', () => {
          let token1: TokenMock, token2: TokenMock

          const amount1 = fp(0.5)
          const amount2 = BigInt(2 * 1e6)
          const feeAmount = fp(0.05)

          beforeEach('deploy tokens', async () => {
            token1 = await ethers.deployContract('TokenMock', ['TKN1', 18])
            token2 = await ethers.deployContract('TokenMock', ['TKN2', 6])
          })

          beforeEach('mint and approve tokens', async () => {
            const totalAmount = amount1 + feeAmount * BigInt(2)
            await token1.mint(user, totalAmount)
            await token1.connect(user).approve(settler, totalAmount)

            await token2.mint(user, amount2)
            await token2.connect(user).approve(settler, amount2)
          })

          beforeEach('create intent', async () => {
            intent = createTransferIntent(
              {
                settler,
                feePayer: user,
                maxFees: [{ token: token1, amount: feeAmount }],
              },
              {
                user,
                transfers: [
                  { token: token1, amount: amount1, recipient },
                  { token: token1, amount: feeAmount, recipient: user }, // has no impact
                  { token: token2, amount: amount2, recipient },
                ],
              }
            )
          })

          it('executes the intent', async () => {
            const preUserBalance1 = await token1.balanceOf(user)
            const preUserBalance2 = await token2.balanceOf(user)
            const preRecipientBalance1 = await token1.balanceOf(recipient)
            const preRecipientBalance2 = await token2.balanceOf(recipient)
            const preSolverBalance = await token1.balanceOf(solver)

            const proposal = createTransferProposal({ fees: [feeAmount] })
            const signature = await signProposal(settler, intent, solver, proposal, admin)
            await settler.execute(intent, proposal, signature)

            const postUserBalance1 = await token1.balanceOf(user)
            expect(preUserBalance1 - postUserBalance1).to.be.eq(amount1 + feeAmount)

            const postUserBalance2 = await token2.balanceOf(user)
            expect(preUserBalance2 - postUserBalance2).to.be.eq(amount2)

            const postRecipientBalance1 = await token1.balanceOf(recipient)
            expect(postRecipientBalance1 - preRecipientBalance1).to.be.eq(amount1)

            const postRecipientBalance2 = await token2.balanceOf(recipient)
            expect(postRecipientBalance2 - preRecipientBalance2).to.be.eq(amount2)

            const postSolverBalance = await token1.balanceOf(solver)
            expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
          })
        })
      })

      context('call', () => {
        context('single call', () => {
          let target: Account, data: string
          let user: SmartAccount

          beforeEach('deploy smart account', async () => {
            user = await ethers.deployContract('SmartAccountContract', [settler, owner])
          })

          context('when the target is not the settler', () => {
            let feeToken: TokenMock | string

            const feeAmount = fp(0.01)

            beforeEach('set target', async () => {
              target = await ethers.deployContract('CallMock')
            })

            context('when the call succeeds', () => {
              beforeEach('set data', async () => {
                data = target.interface.encodeFunctionData('call')
              })

              const itExecutesTheIntentWithValue = (value: BigNumberish) => {
                const eventTopic = randomHex(32)
                const eventData = randomHex(120)

                beforeEach('create intent', async () => {
                  intent = createCallIntent(
                    {
                      settler,
                      feePayer: user,
                      maxFees: [{ token: feeToken, amount: feeAmount }],
                    },
                    {
                      user,
                      calls: [{ target: target, data, value }],
                      events: [{ topic: eventTopic, data: eventData }],
                    }
                  )
                })

                it('executes the intent', async () => {
                  const preUserBalance = await balanceOf(feeToken, user)
                  const preSolverBalance = await balanceOf(feeToken, solver)
                  const preTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target)

                  const proposal = createCallProposal({ fees: [feeAmount] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  const tx = await settler.execute(intent, proposal, signature)

                  const postUserBalance = await balanceOf(feeToken, user)
                  const postSolverBalance = await balanceOf(feeToken, solver)
                  if (feeToken == NATIVE_TOKEN_ADDRESS) {
                    const txReceipt = await (await tx.getTransaction())?.wait()
                    const txCost = txReceipt ? txReceipt.gasUsed * txReceipt.gasPrice : 0n
                    expect(preUserBalance - postUserBalance).to.be.eq(feeAmount + value)
                    expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount - txCost)
                  } else if (feeToken !== USD_ADDRESS) {
                    expect(preUserBalance - postUserBalance).to.be.eq(feeAmount)
                    expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
                  }

                  const postTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target)
                  expect(postTargetBalance - preTargetBalance).to.be.eq(value)
                })

                it('logs the intent events correctly', async () => {
                  const proposal = createCallProposal({ fees: [feeAmount] })
                  const signature = await signProposal(settler, intent, solver, proposal, admin)
                  const tx = await settler.execute(intent, proposal, signature)

                  const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
                  expect(events).to.have.lengthOf(1)

                  expect(events[0].args.user).to.be.equal(intent.operations[0].user)
                  expect(events[0].args.topic).to.be.equal(eventTopic)
                  expect(events[0].args.opType).to.be.equal(OpType.EvmCall)
                  expect(events[0].args.operation).to.not.be.undefined
                  expect(events[0].args.proposal).to.not.be.undefined
                  expect(events[0].args.intentHash).to.be.equal(hashIntent(intent))
                  expect(events[0].args.output).to.not.be.undefined
                  expect(events[0].args.data).to.be.equal(eventData)
                })
              }

              const itExecutesTheIntent = () => {
                context('when the value is 0', () => {
                  const value = 0n

                  itExecutesTheIntentWithValue(value)
                })

                context('when the value is greater than 0', () => {
                  const value = fp(0.00001)

                  beforeEach('fund smart account', async () => {
                    await owner.sendTransaction({ to: user, value })
                  })

                  itExecutesTheIntentWithValue(value)
                })
              }

              context('when the fee token is USD', () => {
                beforeEach('set fee token', async () => {
                  feeToken = USD_ADDRESS
                })

                itExecutesTheIntent()
              })

              context('when the fee token is an ERC20', () => {
                beforeEach('deploy token', async () => {
                  feeToken = await ethers.deployContract('TokenMock', ['WETH', 18])
                })

                beforeEach('mint tokens', async () => {
                  await feeToken.mint(user, feeAmount)
                })

                itExecutesTheIntent()
              })

              context('when the fee token is the native token', () => {
                beforeEach('set token', async () => {
                  feeToken = NATIVE_TOKEN_ADDRESS
                })

                beforeEach('fund smart account', async () => {
                  await owner.sendTransaction({ to: user, value: feeAmount + BigInt(2) })
                })

                itExecutesTheIntent()
              })
            })

            context('when the call fails', () => {
              beforeEach('set data', async () => {
                data = target.interface.encodeFunctionData('callError')
              })

              beforeEach('create intent', async () => {
                intent = createCallIntent(
                  {
                    settler,
                    feePayer: user,
                    maxFees: [{ token: feeToken, amount: feeAmount }],
                  },
                  {
                    user,
                    calls: [{ target: target, data, value: 0 }],
                  }
                )
              })

              it('reverts', async () => {
                const proposal = createCallProposal({ fees: [feeAmount] })
                const signature = await signProposal(settler, intent, solver, proposal, admin)

                await expect(settler.execute(intent, proposal, signature)).to.be.revertedWithCustomError(
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
              await controller.connect(admin).setAllowedSolvers([user], [true])
            })

            beforeEach('set data', async () => {
              const intent = createCallIntent()
              const proposal = createCallProposal()
              const signature = await signProposal(settler, intent, solver, proposal, admin)

              data = settler.interface.encodeFunctionData('execute', [intent, proposal, signature])
            })

            beforeEach('create intent', async () => {
              intent = createCallIntent(
                {
                  settler,
                  feePayer: user,
                },
                {
                  user,
                  calls: [{ target, data, value: 0 }],
                }
              )
            })

            it('reverts', async () => {
              const proposal = createCallProposal()
              const signature = await signProposal(settler, intent, solver, proposal, admin)

              await expect(settler.execute(intent, proposal, signature)).to.be.revertedWithCustomError(
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
            user = await ethers.deployContract('SmartAccountContract', [settler, owner])
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
            await feeToken.mint(user, feeAmount)
          })

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: user, value: value1 + value2 })
          })

          beforeEach('create intent', async () => {
            intent = createCallIntent(
              {
                settler,
                feePayer: user,
                maxFees: [{ token: feeToken, amount: feeAmount }],
              },
              {
                user,
                calls: [
                  { target: target1, data, value: value1 },
                  { target: target2, data, value: value2 },
                  { target: target2, data, value: 0 },
                ],
              }
            )
          })

          it('executes the intent', async () => {
            const preUserBalance = await balanceOf(feeToken, user)
            const preSolverBalance = await balanceOf(feeToken, solver)
            const preTarget1Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target1)
            const preTarget2Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target2)

            const proposal = createCallProposal({ fees: [feeAmount] })
            const signature = await signProposal(settler, intent, solver, proposal, admin)
            await settler.execute(intent, proposal, signature)

            const postUserBalance = await balanceOf(feeToken, user)
            expect(preUserBalance - postUserBalance).to.be.eq(feeAmount)

            const postSolverBalance = await balanceOf(feeToken, solver)
            expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)

            const postTarget1Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target1)
            expect(postTarget1Balance - preTarget1Balance).to.be.eq(value1)

            const postTarget2Balance = await balanceOf(NATIVE_TOKEN_ADDRESS, target2)
            expect(postTarget2Balance - preTarget2Balance).to.be.eq(value2)
          })

          it('calls the smart account contract', async () => {
            const proposal = createCallProposal({ fees: [feeAmount] })
            const signature = await signProposal(settler, intent, solver, proposal, admin)
            const tx = await settler.execute(intent, proposal, signature)

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

      context('dynamic call', () => {
        let user: SmartAccount
        let target: Account
        let feeToken: TokenMock
        let proposal: Proposal

        const argument = randomEvmAddress()
        const feeAmount = fp(0.01)
        const eventTopic = randomHex(32)
        const eventData = randomHex(120)

        beforeEach('deploy contracts', async () => {
          user = await ethers.deployContract('SmartAccountContract', [settler, owner])
          target = await ethers.deployContract('StaticCallMock')
          feeToken = await ethers.deployContract('TokenMock', ['WETH', 18])
        })

        beforeEach('mint tokens', async () => {
          await feeToken.mint(user, feeAmount)
        })

        beforeEach('create intent', async () => {
          intent = createDynamicCallIntent(
            {
              settler,
              feePayer: user,
              maxFees: [{ token: feeToken, amount: feeAmount }],
            },
            {
              user,
              calls: [
                {
                  target,
                  selector: target.interface.getFunction('returnAddress')!.selector,
                  arguments: [literal(['address'], [argument])],
                },
                {
                  target,
                  selector: target.interface.getFunction('returnUint')!.selector,
                  arguments: [staticCall(feeToken.target, feeToken.interface.getFunction('decimals')!.selector, [])],
                },
              ],
              events: [{ topic: eventTopic, data: eventData }],
            }
          )
        })

        beforeEach('create proposal', () => {
          proposal = createDynamicCallProposal({ fees: [feeAmount] })
        })

        it('executes the intent', async () => {
          const preUserBalance = await balanceOf(feeToken, user)
          const preSolverBalance = await balanceOf(feeToken, solver)

          const signature = await signProposal(settler, intent, solver, proposal, admin)
          await settler.execute(intent, proposal, signature)

          const postUserBalance = await balanceOf(feeToken, user)
          expect(preUserBalance - postUserBalance).to.be.eq(feeAmount)

          const postSolverBalance = await balanceOf(feeToken, solver)
          expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
        })

        it('logs the intent events correctly', async () => {
          const signature = await signProposal(settler, intent, solver, proposal, admin)
          const tx = await settler.execute(intent, proposal, signature)

          const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
          expect(events).to.have.lengthOf(1)

          expect(events[0].args.user).to.be.equal(intent.operations[0].user)
          expect(events[0].args.topic).to.be.equal(eventTopic)
          expect(events[0].args.opType).to.be.equal(4)
          expect(events[0].args.intentHash).to.be.equal(hashIntent(intent))
          expect(events[0].args.data).to.be.equal(eventData)

          const [outputs] = AbiCoder.defaultAbiCoder().decode(['bytes[]'], events[0].args.output)
          expect(outputs).to.have.lengthOf(2)

          const [decodedA] = AbiCoder.defaultAbiCoder().decode(['address'], outputs[0])
          expect(decodedA.toLowerCase()).to.be.equal(argument)

          const [decodedB] = AbiCoder.defaultAbiCoder().decode(['uint256'], outputs[1])
          expect(decodedB).to.be.equal(18)
        })
      })

      context('swap + dynamic call', () => {
        let smartAccount: SmartAccount
        let tokenIn: TokenMock
        let tokenOutA: TokenMock, tokenOutB: TokenMock
        let executor: TransferExecutorMock
        let target: Account
        let proposal: Proposal

        const chainId = 31337
        const swapAmountIn = fp(1)
        const swapAmountOutA = BigInt(2900 * 1e6)
        const swapAmountOutB = BigInt(7 * 1e18)
        const eventTopic = randomHex(32)
        const eventData = randomHex(120)

        beforeEach('deploy contracts', async () => {
          smartAccount = await ethers.deployContract('SmartAccountContract', [settler, owner])
          tokenIn = await ethers.deployContract('TokenMock', ['WETH', 18])
          tokenOutA = await ethers.deployContract('TokenMock', ['USDC', 6])
          tokenOutB = await ethers.deployContract('TokenMock', ['DAI', 18])
          executor = await ethers.deployContract('TransferExecutorMock')
          target = await ethers.deployContract('StaticCallMock')
        })

        beforeEach('mint and approve tokens', async () => {
          await tokenIn.mint(user, swapAmountIn)
          await tokenIn.connect(user).approve(settler, swapAmountIn)
          await tokenOutA.mint(executor, swapAmountOutA)
          await tokenOutB.mint(executor, swapAmountOutB)
        })

        beforeEach('create intent', async () => {
          const swapOperation = createSwapOperation({
            user,
            sourceChain: chainId,
            destinationChain: chainId,
            tokensIn: { token: tokenIn, amount: swapAmountIn },
            tokensOut: [
              { token: tokenOutA, minAmount: swapAmountOutA, recipient: other },
              { token: tokenOutB, minAmount: swapAmountOutB, recipient: other },
            ],
          })

          const dynamicCallOperation = createDynamicCallOperation({
            user: smartAccount,
            chainId,
            calls: [
              {
                target,
                selector: target.interface.getFunction('returnUint')!.selector,
                arguments: [variable(0)],
              },
            ],
            events: [{ topic: eventTopic, data: eventData }],
          })

          intent = createIntent({
            settler,
            feePayer: user,
            maxFees: [],
            operations: [swapOperation, dynamicCallOperation],
          })
        })

        beforeEach('create proposal', () => {
          const executorData = AbiCoder.defaultAbiCoder().encode(
            ['address[]', 'uint256[]'],
            [
              [tokenOutA.target, tokenOutB.target],
              [swapAmountOutA, swapAmountOutB],
            ]
          )

          proposal = createSwapProposal({
            executor,
            executorData,
            amountsOut: [swapAmountOutA, swapAmountOutB],
          })
          proposal.datas = [...proposal.datas, '0x']
        })

        it('passes the swap output into the dynamic call', async () => {
          const signature = await signProposal(settler, intent, solver, proposal, admin)
          const tx = await settler.execute(intent, proposal, signature)

          const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
          expect(events).to.have.lengthOf(1)

          expect(events[0].args.opType).to.be.equal(4)
          expect(events[0].args.topic).to.be.equal(eventTopic)
          expect(events[0].args.data).to.be.equal(eventData)

          const [outputs] = AbiCoder.defaultAbiCoder().decode(['bytes[]'], events[0].args.output)
          expect(outputs).to.have.lengthOf(1)

          const [decoded] = AbiCoder.defaultAbiCoder().decode(['uint256'], outputs[0])
          expect(decoded).to.be.equal(swapAmountOutA)

          const callEvents = await smartAccount.queryFilter(smartAccount.filters.Called(), tx.blockNumber)
          expect(callEvents).to.have.lengthOf(1)
          expect(callEvents[0].args.data).to.be.equal(
            target.interface.encodeFunctionData('returnUint', [swapAmountOutA])
          )
        })
      })

      context('one of each', () => {
        let target: Account, data: string
        let smartAccount: SmartAccount
        let feeToken: TokenMock
        let proposal: Proposal
        let executor: TransferExecutorMock
        let tokenOut: TokenMock

        const chainId = 31337

        const callValue = fp(0.00001)
        const feeAmount = fp(0.01)
        const transferAmount = fp(0.5)
        const swapAmountIn = fp(1) // WETH
        const swapMinAmountOut = BigInt(2900 * 1e6) // USDC

        beforeEach('deploy and mint token', async () => {
          feeToken = await ethers.deployContract('TokenMock', ['WETH', 18])
          await feeToken.mint(user, feeAmount)
        })

        beforeEach('prepare call operation', async () => {
          smartAccount = await ethers.deployContract('SmartAccountContract', [settler, owner])
          await owner.sendTransaction({ to: smartAccount, value: callValue })
          target = await ethers.deployContract('CallMock')
          data = target.interface.encodeFunctionData('call')
        })

        beforeEach('prepare swap operation', async () => {
          executor = await ethers.deployContract('TransferExecutorMock')
          tokenOut = await ethers.deployContract('TokenMock', ['USDC', 6])
          await tokenOut.mint(executor, swapMinAmountOut)
          await feeToken.mint(user, swapAmountIn)
        })

        beforeEach('approve token', async () => {
          await feeToken.mint(user, transferAmount)
          await feeToken.connect(user).approve(settler, feeAmount + transferAmount + swapAmountIn)
        })

        beforeEach('create intent', async () => {
          const callOperation = createCallOperation({
            user: smartAccount,
            chainId,
            calls: [{ target: target, data, value: callValue }],
            events: [{ topic: randomHex(32), data: randomHex(120) }],
          })

          const transferOperation = createTransferOperation({
            user,
            chainId,
            transfers: [{ token: feeToken, amount: transferAmount, recipient: other }],
            events: [{ topic: randomHex(32), data: randomHex(120) }],
          })

          const swapOperation = createSwapOperation({
            user,
            sourceChain: chainId,
            destinationChain: chainId,
            tokensIn: { token: feeToken, amount: swapAmountIn },
            tokensOut: { token: tokenOut, minAmount: swapMinAmountOut, recipient: other },
            events: [{ topic: randomHex(32), data: randomHex(120) }],
          })

          intent = createIntent({
            settler,
            feePayer: user,
            maxFees: [{ token: feeToken, amount: feeAmount }],
            operations: [callOperation, transferOperation, swapOperation],
          })
        })

        beforeEach('create proposal', () => {
          const executorData = AbiCoder.defaultAbiCoder().encode(
            ['address[]', 'uint256[]'],
            [[tokenOut.target], [swapMinAmountOut]]
          )
          proposal = createSwapProposal({
            fees: [feeAmount],
            executor,
            executorData,
            amountsOut: [swapMinAmountOut],
          })

          proposal.datas = ['0x', '0x', ...proposal.datas]
        })

        it('executes the intent', async () => {
          const preUserBalance = await balanceOf(feeToken, user)
          const preSolverBalance = await balanceOf(feeToken, solver)
          const preTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target)
          const preOtherBalance = await balanceOf(feeToken, other)
          const preOtherUSDCBalance = await balanceOf(tokenOut, other)

          const signature = await signProposal(settler, intent, solver, proposal, admin)
          await settler.execute(intent, proposal, signature)

          const postUserBalance = await balanceOf(feeToken, user)
          const postSolverBalance = await balanceOf(feeToken, solver)
          const postOtherBalance = await balanceOf(feeToken, other)
          // intent fee
          expect(preUserBalance - postUserBalance).to.be.eq(feeAmount + transferAmount + swapAmountIn)
          expect(postSolverBalance - preSolverBalance).to.be.eq(feeAmount)
          // transfer operation
          expect(postOtherBalance - preOtherBalance).to.be.eq(transferAmount)
          // call operation
          const postTargetBalance = await balanceOf(NATIVE_TOKEN_ADDRESS, target)
          expect(postTargetBalance - preTargetBalance).to.be.equal(callValue)
          // swap operation
          const postOtherUSDCBalance = await balanceOf(tokenOut, other)
          expect(postOtherUSDCBalance - preOtherUSDCBalance).to.be.equal(swapMinAmountOut)
        })

        it('logs the intent events correctly', async () => {
          const signature = await signProposal(settler, intent, solver, proposal, admin)
          const tx = await settler.execute(intent, proposal, signature)

          const events = await settler.queryFilter(settler.filters.OperationExecuted(), tx.blockNumber)
          expect(events).to.have.lengthOf(3)
          // checking correct order of events Call->Transfer->Swap
          expect(events[0].args.opType).to.be.equal(OpType.EvmCall)
          expect(events[1].args.opType).to.be.equal(OpType.Transfer)
          expect(events[2].args.opType).to.be.equal(OpType.Swap)
        })
      })
    })
  })

  describe('simulate', () => {
    context('when the sender is an allowed solver', () => {
      beforeEach('allow solver', async () => {
        await controller.connect(admin).setAllowedSolvers([solver], [true])
        settler = settler.connect(solver)
      })

      it('reverts', async () => {
        const intent = createSwapIntent({ settler })
        const proposal = createSwapProposal({ executor: await ethers.deployContract('EmptyExecutorMock') })
        const fakeProposalSig = await Wallet.createRandom().signMessage(getBytes('0x'))
        await expect(settler.simulate(intent, proposal, fakeProposalSig)).to.be.revertedWithCustomError(
          settler,
          'SettlerSimulationSuccess'
        )
      })
    })

    context('when the sender is not an allowed solver', () => {
      it('reverts', async () => {
        await expect(settler.simulate(createIntent(), createProposal(), '0x')).to.be.revertedWithCustomError(
          settler,
          'SettlerSolverNotAllowed'
        )
      })
    })
  })

  describe('reentrancy guard', () => {
    let executor: ReentrantExecutorMock

    beforeEach('deploy executor mock', async () => {
      executor = await ethers.deployContract('ReentrantExecutorMock', [settler])
      await controller.connect(admin).setAllowedExecutors([executor], [true])
    })

    beforeEach('allow solvers and set sender', async () => {
      await controller.connect(admin).setAllowedSolvers([solver, executor], [true, true])
      settler = settler.connect(solver)
    })

    beforeEach('allow proposal signer', async () => {
      await controller.connect(admin).setAllowedProposalSigners([admin], [true])
    })

    it('reverts', async () => {
      const intent = createSwapIntent({ settler })
      const proposal = createSwapProposal({ executor })
      const signature = await signProposal(settler, intent, solver, proposal, admin)

      await expect(settler.execute(intent, proposal, signature)).to.be.revertedWithCustomError(
        settler,
        'ReentrancyGuardReentrantCall'
      )
    })
  })
})
