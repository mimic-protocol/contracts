import { randomAddress, randomHex } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { network } from 'hardhat'

import { IntentsValidator } from '../../types/ethers-contracts/index.js'
import {
  CallSafeguardMode,
  createCallIntent,
  createDeniedAccountSafeguard,
  createDeniedChainSafeguard,
  createDeniedSelectorSafeguard,
  createListSafeguard,
  createOnlyAccountSafeguard,
  createOnlyChainSafeguard,
  createOnlySelectorSafeguard,
  createSafeguardNone,
  createSwapIntent,
  createTransferIntent,
  createTreeSafeguard,
  SafeguardGroupLogic,
  SwapSafeguardMode,
  TransferSafeguardMode,
} from '../helpers'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('IntentsValidator', () => {
  let validator: IntentsValidator

  const CHAIN_LOCAL = 31337
  const CHAIN_OTHER = 100
  const token1 = randomAddress()
  const token2 = randomAddress()
  const account1 = randomAddress()
  const account2 = randomAddress()

  beforeEach('deploy contract', async () => {
    validator = await ethers.deployContract('IntentsValidator')
  })

  describe('List', () => {
    describe('Swap modes', () => {
      context('None', () => {
        const intent = createSwapIntent()
        const safeguard = createSafeguardNone()

        it('always reverts with IntentsValidatorNoneAllowed', async () => {
          await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorNoneAllowed'
          )
        })
      })

      context('SourceChain', () => {
        const intent = createSwapIntent({ sourceChain: CHAIN_LOCAL, destinationChain: CHAIN_LOCAL })

        context('when the source chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the source chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the source chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('DestinationChain', () => {
        const intent = createSwapIntent({ sourceChain: CHAIN_LOCAL, destinationChain: CHAIN_LOCAL })

        context('when the destination chain is allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the destination chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the destination chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('TokenIn', () => {
        const intent = createSwapIntent({ tokensIn: [{ token: token1, amount: 1n }], tokensOut: [] })

        context('when the token in is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the token in is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token in is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('TokenOut', () => {
        const intent = createSwapIntent({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

        context('when the token out is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a token out is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token out is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Recipient', () => {
        const intent = createSwapIntent({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

        context('when the recipient is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a recipient is denied', () => {
          const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.Recipient, account1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when a recipient is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })
    })

    describe('Transfer modes', () => {
      context('None', () => {
        const intent = createTransferIntent()
        const safeguard = createSafeguardNone()

        it('always reverts with IntentsValidatorNoneAllowed', async () => {
          await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorNoneAllowed'
          )
        })
      })

      context('Chain', () => {
        const intent = createTransferIntent({ chainId: CHAIN_LOCAL, transfers: [] })

        context('when the chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(TransferSafeguardMode.Chain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(TransferSafeguardMode.Chain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(TransferSafeguardMode.Chain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Token', () => {
        const intent = createTransferIntent({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

        context('when all tokens are not denied', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when a token is denied', () => {
          const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Token, token1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when a token is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Recipient', () => {
        const intent = createTransferIntent({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

        context('when the recipient is allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the recipient is denied', () => {
          const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Recipient, account1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the recipient is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })
    })

    describe('Call modes', () => {
      const target1 = randomAddress()
      const target2 = randomAddress()

      context('None', () => {
        const intent = createCallIntent()
        const safeguard = createSafeguardNone()

        it('always reverts with IntentsValidatorNoneAllowed', async () => {
          await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorNoneAllowed'
          )
        })
      })

      context('Chain', () => {
        const intent = createCallIntent({ chainId: CHAIN_LOCAL, calls: [] })

        context('when the chain is not denied', () => {
          const safeguard = createOnlyChainSafeguard(CallSafeguardMode.Chain, CHAIN_LOCAL)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the chain is denied', () => {
          const safeguard = createDeniedChainSafeguard(CallSafeguardMode.Chain, CHAIN_LOCAL)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the chain is not allowed', () => {
          const safeguard = createOnlyChainSafeguard(CallSafeguardMode.Chain, CHAIN_OTHER)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Target', () => {
        const intent = createCallIntent({ calls: [{ target: target1, data: '0x', value: 0 }] })

        context('when all targets are not denied', () => {
          const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target1)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the target is denied', () => {
          const safeguard = createDeniedAccountSafeguard(CallSafeguardMode.Target, target1)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the target is not allowed', () => {
          const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target2)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })

      context('Selector', () => {
        const selector = '0xa9059cbb'
        const intent = createCallIntent({ calls: [{ target: target1, data: selector, value: 0 }] })

        context('when the selector is allowed', () => {
          const safeguard = createOnlySelectorSafeguard(selector)

          it('passes', async () => {
            expect(await validator.validate(intent, createListSafeguard(safeguard))).to.not.be.reverted
          })
        })

        context('when the selector is denied', () => {
          const safeguard = createDeniedSelectorSafeguard(selector)

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })

        context('when the selector is not allowed', () => {
          const safeguard = createOnlySelectorSafeguard(randomHex(4))

          it('reverts', async () => {
            await expect(validator.validate(intent, createListSafeguard(safeguard))).to.be.revertedWithCustomError(
              validator,
              'IntentsValidatorSafeguardFailed'
            )
          })
        })
      })
    })
  })

  describe('Tree', () => {
    const intent = createSwapIntent({
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
          expect(await validator.validate(intent, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('when one child fails', () => {
        const leaves = [
          createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
        ]

        const groups = [{ logic: SafeguardGroupLogic.AND, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(validator.validate(intent, createTreeSafeguard(groups, leaves))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSafeguardFailed'
          )
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
          expect(await validator.validate(intent, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('when no child passes', () => {
        const leaves = [
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2),
          createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
        ]

        const groups = [{ logic: SafeguardGroupLogic.OR, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(validator.validate(intent, createTreeSafeguard(groups, leaves))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSafeguardFailed'
          )
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
          expect(await validator.validate(intent, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('more than child one passes', () => {
        const leaves = [
          createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL),
          createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1),
        ]

        const groups = [{ logic: SafeguardGroupLogic.XOR, leaves: [0, 1], children: [] }]

        it('reverts', async () => {
          await expect(validator.validate(intent, createTreeSafeguard(groups, leaves))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSafeguardFailed'
          )
        })
      })

      context('when no child passes', () => {
        const leaves = [createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2)]
        const groups = [{ logic: SafeguardGroupLogic.XOR, leaves: [0], children: [] }]

        it('reverts', async () => {
          await expect(validator.validate(intent, createTreeSafeguard(groups, leaves))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSafeguardFailed'
          )
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
          expect(await validator.validate(intent, createTreeSafeguard(groups, leaves))).to.not.be.reverted
        })
      })

      context('some child passes', () => {
        const leaves = [createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)]

        const groups = [{ logic: SafeguardGroupLogic.NOT, leaves: [0], children: [] }]

        it('reverts', async () => {
          await expect(validator.validate(intent, createTreeSafeguard(groups, leaves))).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSafeguardFailed'
          )
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
        expect(await validator.validate(intent, createTreeSafeguard(groups, leaves))).to.not.be.reverted
      })
    })
  })
})
