import { randomEvmAddress, randomHex } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { network } from 'hardhat'

import { OperationsValidator } from '../../types/ethers-contracts/index.js'
import {
  CallSafeguardMode,
  createCallOperation,
  createCrossChainSwapOperation,
  createDeniedAccountSafeguard,
  createDeniedChainSafeguard,
  createDeniedSelectorSafeguard,
  createListSafeguard,
  createOnlyAccountSafeguard,
  createOnlyChainSafeguard,
  createOnlySelectorSafeguard,
  createSafeguardNone,
  createSwapOperation,
  createTransferOperation,
  createTreeSafeguard,
  SafeguardGroupLogic,
  SwapSafeguardMode,
  TransferSafeguardMode,
} from '../helpers/index.js'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('OperationsValidator', () => {
  let validator: OperationsValidator

  const CHAIN_LOCAL = 31337
  const CHAIN_OTHER = 100
  const token1 = randomEvmAddress()
  const token2 = randomEvmAddress()
  const account1 = randomEvmAddress()
  const account2 = randomEvmAddress()

  beforeEach('deploy contract', async () => {
    validator = await ethers.deployContract('OperationsValidator')
  })

  describe('List', () => {
    describe('Swap modes', () => {
      context('None', () => {
        const operation = createSwapOperation()
        const safeguard = createSafeguardNone()

        it('always reverts with OperationsValidatorNoneAllowed', async () => {
          await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'OperationsValidatorNoneAllowed'
          )
        })
      })

      context('SourceChain', () => {
        const operation = createSwapOperation({ sourceChain: CHAIN_LOCAL, destinationChain: CHAIN_LOCAL })
        context('when the source chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the source chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the source chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('DestinationChain', () => {
        const operation = createSwapOperation({ sourceChain: CHAIN_LOCAL, destinationChain: CHAIN_LOCAL })

        context('when the destination chain is allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the destination chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the destination chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('TokenIn', () => {
        const operation = createCrossChainSwapOperation({ tokensIn: [{ token: token1, amount: 1n }], tokensOut: [] })

        context('when the token in is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the token in is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token in is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('TokenOut', () => {
        const operation = createSwapOperation({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

        context('when the token out is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a token out is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token out is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Recipient', () => {
        const operation = createSwapOperation({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

        context('when the recipient is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a recipient is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.Recipient, account1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when a recipient is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })
    })

    describe('Transfer modes', () => {
      context('None', () => {
        const operation = createTransferOperation()
        const safeguard = createSafeguardNone()

        it('always reverts with OperationsValidatorNoneAllowed', async () => {
          await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'OperationsValidatorNoneAllowed'
          )
        })
      })

      context('Chain', () => {
        const operation = createTransferOperation({ chainId: CHAIN_LOCAL, transfers: [] })

        context('when the chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(TransferSafeguardMode.Chain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(TransferSafeguardMode.Chain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(TransferSafeguardMode.Chain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Token', () => {
        const operation = createTransferOperation({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

        context('when all tokens are not denied', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a token is denied', () => {
          const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Token, token1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Recipient', () => {
        const operation = createTransferOperation({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

        context('when the recipient is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the recipient is denied', () => {
          const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Recipient, account1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the recipient is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })
    })

    describe('Call modes', () => {
      const target1 = randomEvmAddress()
      const target2 = randomEvmAddress()

      context('None', () => {
        const operation = createCallOperation()
        const safeguard = createSafeguardNone()

        it('always reverts with OperationsValidatorNoneAllowed', async () => {
          await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'OperationsValidatorNoneAllowed'
          )
        })
      })

      context('Chain', () => {
        const operation = createCallOperation({ chainId: CHAIN_LOCAL, calls: [] })

        context('when the chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(CallSafeguardMode.Chain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(CallSafeguardMode.Chain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(CallSafeguardMode.Chain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Target', () => {
        const operation = createCallOperation({ calls: [{ target: target1, data: '0x', value: 0 }] })

        context('when all targets are not denied', () => {
          const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target1)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the target is denied', () => {
          const safeguard = createDeniedAccountSafeguard(CallSafeguardMode.Target, target1)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the target is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target2)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Selector', () => {
        const selector = '0xa9059cbb'
        const operation = createCallOperation({ calls: [{ target: target1, data: selector, value: 0 }] })

        context('when the selector is allowed', () => {
          const safeguard = createOnlySelectorSafeguard(selector)

          it('passes', async () => {
            expect(await validator.validate(operation, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the selector is denied', () => {
          const safeguard = createDeniedSelectorSafeguard(selector)

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })

        context('when the selector is not allowed', () => {
          const safeguard = createOnlySelectorSafeguard(randomHex(4))

          it('reverts', async () => {
            await expect(validator.validate(operation, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'OperationsValidatorSafeguardFailed'
            )
          })
        })
      })
    })
  })

  describe('Tree', () => {
    const operation = createSwapOperation({
      sourceChain: CHAIN_LOCAL,
      destinationChain: CHAIN_LOCAL,
      tokensIn: [{ token: token1, amount: 1n }],
    })

    describe('AND', () => {
      context('when all children pass', () => {
        const leaves = [
          createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
        ]

        const groups = [{ logic: SafeguardGroupLogic.AND, leaves: [0, 1], children: [] }]

        it('passes', async () => {
          expect(await validator.validate(operation, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('when one child fails', () => {
        const leaves = [
          createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
        ]

        const groups = [{ logic: SafeguardGroupLogic.AND, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(
            validator.validate(operation, createTreeSafeguard(groups, leaves))
          ).to.be.revertedWithCustomError(validator, 'OperationsValidatorSafeguardFailed')
        })
      })
    })

    describe('OR', () => {
      context('when at least one child passes', () => {
        const leaves = [
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
        ]

        const groups = [{ logic: SafeguardGroupLogic.OR, leaves: [0, 1], children: [] }]

        it('passes', async () => {
          expect(await validator.validate(operation, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('when no child passes', () => {
        const leaves = [
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
          createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
        ]

        const groups = [{ logic: SafeguardGroupLogic.OR, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(
            validator.validate(operation, createTreeSafeguard(groups, leaves))
          ).to.be.revertedWithCustomError(validator, 'OperationsValidatorSafeguardFailed')
        })
      })
    })

    describe('XOR', () => {
      context('when exactly one child passes', () => {
        const leaves = [
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
        ]

        const groups = [{ logic: SafeguardGroupLogic.XOR, leaves: [0, 1], children: [] }]

        it('passes', async () => {
          expect(await validator.validate(operation, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('more than child one passes', () => {
        const leaves = [
          createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
        ]

        const groups = [{ logic: SafeguardGroupLogic.XOR, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(
            validator.validate(operation, createTreeSafeguard(groups, leaves))
          ).to.be.revertedWithCustomError(validator, 'OperationsValidatorSafeguardFailed')
        })
      })

      context('when no child passes', () => {
        const leaves = [createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2)]
        const groups = [{ logic: SafeguardGroupLogic.XOR, leaves: [0], children: [] }]

        it('reverts', async () => {
          await expect(
            validator.validate(operation, createTreeSafeguard(groups, leaves))
          ).to.be.revertedWithCustomError(validator, 'OperationsValidatorSafeguardFailed')
        })
      })
    })

    describe('NOT', () => {
      context('when every child fails', () => {
        const leaves = [
          createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createDeniedAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
        ]

        const groups = [{ logic: SafeguardGroupLogic.NOT, leaves: [0, 1], children: [] }]

        it('passes', async () => {
          expect(await validator.validate(operation, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('some child passes', () => {
        const leaves = [createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)]

        const groups = [{ logic: SafeguardGroupLogic.NOT, leaves: [0], children: [] }]

        it('reverts', async () => {
          await expect(
            validator.validate(operation, createTreeSafeguard(groups, leaves))
          ).to.be.revertedWithCustomError(validator, 'OperationsValidatorSafeguardFailed')
        })
      })
    })

    describe('nested groups', () => {
      const leaves = [
        createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
        createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
        createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
      ]

      const groups = [
        { logic: SafeguardGroupLogic.AND, leaves: [2], children: [1] },
        { logic: SafeguardGroupLogic.OR, leaves: [0, 1], children: [] },
      ]

      it('passes', async () => {
        expect(await validator.validate(operation, createTreeSafeguard(groups, leaves))).to.not.be.reverted
      })
    })
  })
})
