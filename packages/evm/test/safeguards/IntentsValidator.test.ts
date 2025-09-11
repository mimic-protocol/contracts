import { randomEvmAddress, randomHex } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { network } from 'hardhat'

import { IntentsValidator } from '../../types/ethers-contracts/index.js'
import {
  CallSafeguardMode,
  createCallIntent,
  createDeniedAccountSafeguard,
  createDeniedChainSafeguard,
  createDeniedSelectorSafeguard,
  createOnlyAccountSafeguard,
  createOnlyChainSafeguard,
  createOnlySelectorSafeguard,
  createSafeguardNone,
  createSwapIntent,
  createTransferIntent,
  SwapSafeguardMode,
  TransferSafeguardMode,
} from '../helpers'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('IntentsValidator', () => {
  let validator: IntentsValidator

  const CHAIN_LOCAL = 31337
  const CHAIN_OTHER = 100
  const token1 = randomEvmAddress()
  const token2 = randomEvmAddress()
  const account1 = randomEvmAddress()
  const account2 = randomEvmAddress()

  beforeEach('deploy contract', async () => {
    validator = await ethers.deployContract('IntentsValidator')
  })

  describe('Swap modes', () => {
    context('None', () => {
      const intent = createSwapIntent()
      const safeguard = createSafeguardNone()

      it('always reverts with IntentsValidatorNoneAllowed', async () => {
        await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
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
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the source chain is denied', () => {
        const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_LOCAL)

        it('reverts with IntentsValidatorSwapSourceChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapSourceChainNotAllowed'
          )
        })
      })

      context('when the source chain is not allowed', () => {
        const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.SourceChain, CHAIN_OTHER)

        it('reverts with IntentsValidatorSwapSourceChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapSourceChainNotAllowed'
          )
        })
      })
    })

    context('DestinationChain', () => {
      const intent = createSwapIntent({ sourceChain: CHAIN_LOCAL, destinationChain: CHAIN_LOCAL })

      context('when the destination chain is allowed', () => {
        const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the destination chain is denied', () => {
        const safeguard = createDeniedChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_LOCAL)

        it('reverts with IntentsValidatorSwapDestinationChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapDestinationChainNotAllowed'
          )
        })
      })

      context('when the destination chain is not allowed', () => {
        const safeguard = createOnlyChainSafeguard(SwapSafeguardMode.DestinationChain, CHAIN_OTHER)

        it('reverts with IntentsValidatorSwapDestinationChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapDestinationChainNotAllowed'
          )
        })
      })
    })

    context('TokenIn', () => {
      const intent = createSwapIntent({ tokensIn: [{ token: token1, amount: 1n }], tokensOut: [] })

      context('when the token in is allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the token in is denied', () => {
        const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenIn, token1)

        it('reverts with IntentsValidatorSwapTokenInNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapTokenInNotAllowed'
          )
        })
      })

      context('when a token in is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenIn, token2)

        it('reverts with IntentsValidatorSwapTokenInNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapTokenInNotAllowed'
          )
        })
      })
    })

    context('TokenOut', () => {
      const intent = createSwapIntent({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

      context('when the token out is allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when a token out is denied', () => {
        const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.TokenOut, token1)

        it('reverts with IntentsValidatorSwapTokenOutNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapTokenOutNotAllowed'
          )
        })
      })

      context('when a token out is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.TokenOut, token2)

        it('reverts with IntentsValidatorSwapTokenOutNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapTokenOutNotAllowed'
          )
        })
      })
    })

    context('Recipient', () => {
      const intent = createSwapIntent({ tokensOut: [{ token: token1, minAmount: 0, recipient: account1 }] })

      context('when the recipient is allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when a recipient is denied', () => {
        const safeguard = createDeniedAccountSafeguard(SwapSafeguardMode.Recipient, account1)

        it('reverts with IntentsValidatorSwapRecipientNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapRecipientNotAllowed'
          )
        })
      })

      context('when a recipient is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(SwapSafeguardMode.Recipient, account2)

        it('reverts with IntentsValidatorSwapRecipientNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorSwapRecipientNotAllowed'
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
        await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
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
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the chain is denied', () => {
        const safeguard = createDeniedChainSafeguard(TransferSafeguardMode.Chain, CHAIN_LOCAL)

        it('reverts with IntentsValidatorTransferChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferChainNotAllowed'
          )
        })
      })

      context('when the chain is not allowed', () => {
        const safeguard = createOnlyChainSafeguard(TransferSafeguardMode.Chain, CHAIN_OTHER)

        it('reverts with IntentsValidatorTransferChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferChainNotAllowed'
          )
        })
      })
    })

    context('Token', () => {
      const intent = createTransferIntent({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

      context('when all tokens are not denied', () => {
        const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when a token is denied', () => {
        const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Token, token1)

        it('reverts with IntentsValidatorTransferTokenNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferTokenNotAllowed'
          )
        })
      })

      context('when a token is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Token, token2)

        it('reverts with IntentsValidatorTransferTokenNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferTokenNotAllowed'
          )
        })
      })
    })

    context('Recipient', () => {
      const intent = createTransferIntent({ transfers: [{ token: token1, amount: 1n, recipient: account1 }] })

      context('when the recipient is allowed', () => {
        const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the recipient is denied', () => {
        const safeguard = createDeniedAccountSafeguard(TransferSafeguardMode.Recipient, account1)

        it('reverts with IntentsValidatorTransferRecipientNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferRecipientNotAllowed'
          )
        })
      })

      context('when the recipient is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(TransferSafeguardMode.Recipient, account2)

        it('reverts with IntentsValidatorTransferRecipientNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorTransferRecipientNotAllowed'
          )
        })
      })
    })
  })

  describe('Call modes', () => {
    const target1 = randomEvmAddress()
    const target2 = randomEvmAddress()

    context('None', () => {
      const intent = createCallIntent()
      const safeguard = createSafeguardNone()

      it('always reverts with IntentsValidatorNoneAllowed', async () => {
        await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
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
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the chain is denied', () => {
        const safeguard = createDeniedChainSafeguard(CallSafeguardMode.Chain, CHAIN_LOCAL)

        it('reverts with IntentsValidatorCallChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallChainNotAllowed'
          )
        })
      })

      context('when the chain is not allowed', () => {
        const safeguard = createOnlyChainSafeguard(CallSafeguardMode.Chain, CHAIN_OTHER)

        it('reverts with IntentsValidatorCallChainNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallChainNotAllowed'
          )
        })
      })
    })

    context('Target', () => {
      const intent = createCallIntent({ calls: [{ target: target1, data: '0x', value: 0 }] })

      context('when all targets are not denied', () => {
        const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target1)

        it('passes', async () => {
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the target is denied', () => {
        const safeguard = createDeniedAccountSafeguard(CallSafeguardMode.Target, target1)

        it('reverts with IntentsValidatorCallTargetNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallTargetNotAllowed'
          )
        })
      })

      context('when the target is not allowed', () => {
        const safeguard = createOnlyAccountSafeguard(CallSafeguardMode.Target, target2)

        it('reverts with IntentsValidatorCallTargetNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallTargetNotAllowed'
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
          await expect(validator.validate(intent, [safeguard])).to.not.be.reverted
        })
      })

      context('when the selector is denied', () => {
        const safeguard = createDeniedSelectorSafeguard(selector)

        it('reverts with IntentsValidatorCallSelectorNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallSelectorNotAllowed'
          )
        })
      })

      context('when the selector is not allowed', () => {
        const safeguard = createOnlySelectorSafeguard(randomHex(4))

        it('reverts with IntentsValidatorCallSelectorNotAllowed', async () => {
          await expect(validator.validate(intent, [safeguard])).to.be.revertedWithCustomError(
            validator,
            'IntentsValidatorCallSelectorNotAllowed'
          )
        })
      })
    })
  })
})
