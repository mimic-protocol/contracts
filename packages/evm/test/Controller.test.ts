import { randomAddress } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import { network } from 'hardhat'

import { Controller } from '../types/ethers-contracts/index.js'
import itBehavesLikeOwnable from './behaviors/Ownable.behavior'

const { ethers } = await network.connect()

describe('Controller', () => {
  let controller: Controller
  let owner: HardhatEthersSigner, other: HardhatEthersSigner

  const allowedSolvers = [randomAddress(), randomAddress()]
  const allowedExecutors = [randomAddress(), randomAddress(), randomAddress()]
  const allowedProposalSigners = [randomAddress(), randomAddress(), randomAddress(), randomAddress()]
  const allowedValidators = [randomAddress(), randomAddress(), randomAddress(), randomAddress()]

  beforeEach('deploy controller', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, other] = await ethers.getSigners();
    controller = await ethers.deployContract('Controller', [
      owner.address,
      allowedSolvers,
      allowedExecutors,
      allowedProposalSigners,
      allowedValidators,
    ])
  })

  describe('ownable', () => {
    beforeEach('set instance', function () {
      this.owner = owner
      this.ownable = controller
    })

    itBehavesLikeOwnable()
  })

  describe('initialization', () => {
    it('initializes allowed solvers properly', async () => {
      for (const address of allowedSolvers) {
        expect(await controller.isSolverAllowed(address)).to.be.true
      }

      for (const address of allowedExecutors.concat(allowedProposalSigners)) {
        expect(await controller.isSolverAllowed(address)).to.be.false
      }
    })

    it('initializes allowed executors properly', async () => {
      for (const address of allowedExecutors) {
        expect(await controller.isExecutorAllowed(address)).to.be.true
      }

      for (const address of allowedSolvers.concat(allowedProposalSigners)) {
        expect(await controller.isExecutorAllowed(address)).to.be.false
      }
    })

    it('initializes allowed proposal signers properly', async () => {
      for (const address of allowedProposalSigners) {
        expect(await controller.isProposalSignerAllowed(address)).to.be.true
      }

      for (const address of allowedSolvers.concat(allowedExecutors)) {
        expect(await controller.isProposalSignerAllowed(address)).to.be.false
      }
    })

    it('initializes allowed validators properly', async () => {
      for (const address of allowedValidators) {
        expect(await controller.isValidatorAllowed(address)).to.be.true
      }

      for (const address of allowedSolvers.concat(allowedProposalSigners)) {
        expect(await controller.isValidatorAllowed(address)).to.be.false
      }
    })
  })

  const itHandlesControllerConfigProperly = (config: string) => {
    const titleCasedConfig = config.charAt(0).toUpperCase() + config.slice(1)
    const getter = `is${titleCasedConfig}Allowed`
    const setter = `setAllowed${titleCasedConfig}s`

    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        controller = controller.connect(owner)
      })

      context('when the inputs lengths match', () => {
        const keys = [randomAddress(), randomAddress(), randomAddress()].map((a) => getAddress(a))
        const values = [true, true, false]

        const itSetsTheConfigsProperly = () => {
          it('sets the configs properly', async () => {
            await controller[setter](keys, values)

            for (const [i, key] of keys.entries()) {
              const value = values[i]
              expect(await controller[getter](key)).to.be.equal(value)
            }
          })

          it('emits the corresponding events', async () => {
            const tx = await controller[setter](keys, values)

            const event = `${titleCasedConfig}AllowedSet`
            const events = await controller.queryFilter(controller.filters[event](), tx.blockNumber)

            for (const [i, key] of keys.entries()) {
              const value = values[i]
              expect(events[i].args[config]).to.equal(key)
              expect(events[i].args.allowed).to.equal(value)
            }
          })
        }

        context('when setting the config for the first time', () => {
          itSetsTheConfigsProperly()
        })

        context('when the settings were already set', () => {
          beforeEach('configure settings', async () => {
            await controller[setter]([keys[0]], [!values[0]])
          })

          itSetsTheConfigsProperly()
        })
      })

      context('when the inputs lengths do not match', () => {
        it('reverts', async () => {
          // eslint-disable-next-line no-secrets/no-secrets
          await expect(controller[setter]([], [true])).to.be.revertedWithCustomError(
            controller,
            'ControllerInputInvalidLength'
          )
        })
      })
    })

    context('when the sender is not the owner', () => {
      beforeEach('set sender', () => {
        controller = controller.connect(other)
      })

      it('reverts', async () => {
        // eslint-disable-next-line no-secrets/no-secrets
        await expect(controller[setter]([], [])).to.be.revertedWithCustomError(controller, 'OwnableUnauthorizedAccount')
      })
    })
  }

  describe('setAllowedSolvers', () => {
    itHandlesControllerConfigProperly('solver')
  })

  describe('setAllowedExecutors', () => {
    itHandlesControllerConfigProperly('executor')
  })

  describe('setAllowedProposalSigners', () => {
    itHandlesControllerConfigProperly('proposalSigner')
  })

  describe('setAllowedValidators', () => {
    itHandlesControllerConfigProperly('validator')
  })
})
