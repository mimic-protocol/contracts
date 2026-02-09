import { fp, randomEvmAddress, ZERO_ADDRESS } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import { network } from 'hardhat'

import { PaymentsReceiver, TokenMock } from '../../types/ethers-contracts/index.js'
import itBehavesLikeOwnable from '../behaviors/Ownable.behavior.js'

const { ethers } = await network.connect()

describe('PaymentsReceiver', () => {
  let paymentsReceiver: PaymentsReceiver
  let owner: HardhatEthersSigner, payer: HardhatEthersSigner

  beforeEach('deploy contracts', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, payer] = await ethers.getSigners();
    paymentsReceiver = await ethers.deployContract('PaymentsReceiver', [owner.address])
  })

  describe('ownable', () => {
    beforeEach('set instance', function () {
      this.owner = owner
      this.ownable = paymentsReceiver
    })

    itBehavesLikeOwnable()
  })

  describe('deposit', () => {
    beforeEach('set sender', () => {
      paymentsReceiver = paymentsReceiver.connect(payer)
    })

    context('when the token is not zero', () => {
      let token: TokenMock

      beforeEach('set token', async () => {
        token = await ethers.deployContract('TokenMock', ['TKN', 18])
        await token.mint(payer.address, fp(1000))
      })

      context('when the amount is not zero', () => {
        const amount = fp(10)

        beforeEach('approve', async () => {
          await token.connect(payer).approve(paymentsReceiver.target, amount)
        })

        it('deposits tokens correctly', async () => {
          const preContractBalance = await token.balanceOf(paymentsReceiver.target)
          const prePayerBalance = await token.balanceOf(payer.address)

          await paymentsReceiver.deposit(token.target, amount)

          const postContractBalance = await token.balanceOf(paymentsReceiver.target)
          expect(postContractBalance).to.equal(preContractBalance + amount)

          const postPayerBalance = await token.balanceOf(payer.address)
          expect(postPayerBalance).to.equal(prePayerBalance - amount)
        })

        it('emits an event', async () => {
          await expect(paymentsReceiver.deposit(token.target, amount))
            .to.emit(paymentsReceiver, 'Deposited')
            .withArgs(token.target, payer.address, payer.address, amount)
        })
      })

      context('when the amount is zero', () => {
        const amount = 0

        it('reverts', async () => {
          await expect(paymentsReceiver.deposit(token.target, amount)).to.be.revertedWithCustomError(
            paymentsReceiver,
            'PaymentsReceiverAmountZero'
          )
        })
      })
    })

    context('when the token is zero', () => {
      const token = ZERO_ADDRESS

      it('reverts', async () => {
        await expect(paymentsReceiver.deposit(token, 0)).to.be.revertedWithCustomError(
          paymentsReceiver,
          'PaymentsReceiverTokenZero'
        )
      })
    })
  })

  describe('depositOnBehalf', () => {
    beforeEach('set sender', () => {
      paymentsReceiver = paymentsReceiver.connect(payer)
    })

    context('when the user is not zero', () => {
      const user = randomEvmAddress()

      context('when the token is not zero', () => {
        let token: TokenMock

        beforeEach('set token', async () => {
          token = await ethers.deployContract('TokenMock', ['TKN', 18])
          await token.mint(payer.address, fp(1000))
        })

        context('when the amount is not zero', () => {
          const amount = fp(10)

          beforeEach('approve', async () => {
            await token.connect(payer).approve(paymentsReceiver.target, amount)
          })

          it('deposits tokens correctly', async () => {
            const preContractBalance = await token.balanceOf(paymentsReceiver.target)
            const prePayerBalance = await token.balanceOf(payer.address)

            await paymentsReceiver.depositOnBehalf(token.target, user, amount)

            const postContractBalance = await token.balanceOf(paymentsReceiver.target)
            expect(postContractBalance).to.equal(preContractBalance + amount)

            const postPayerBalance = await token.balanceOf(payer.address)
            expect(postPayerBalance).to.equal(prePayerBalance - amount)
          })

          it('emits an event', async () => {
            await expect(paymentsReceiver.depositOnBehalf(token.target, user, amount))
              .to.emit(paymentsReceiver, 'Deposited')
              .withArgs(token.target, payer.address, getAddress(user), amount)
          })
        })

        context('when the amount is zero', () => {
          const amount = 0

          it('reverts', async () => {
            await expect(paymentsReceiver.depositOnBehalf(token.target, user, amount)).to.be.revertedWithCustomError(
              paymentsReceiver,
              'PaymentsReceiverAmountZero'
            )
          })
        })
      })

      context('when the token is zero', () => {
        const token = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(paymentsReceiver.depositOnBehalf(token, user, 0)).to.be.revertedWithCustomError(
            paymentsReceiver,
            'PaymentsReceiverTokenZero'
          )
        })
      })
    })

    context('when the user is zero', () => {
      const user = ZERO_ADDRESS

      it('reverts', async () => {
        await expect(paymentsReceiver.depositOnBehalf(ZERO_ADDRESS, user, 0)).to.be.revertedWithCustomError(
          paymentsReceiver,
          'PaymentsReceiverUserZero'
        )
      })
    })
  })

  describe('withdraw', () => {
    context('when the sender is the owner', () => {
      beforeEach('set sender', () => {
        paymentsReceiver = paymentsReceiver.connect(owner)
      })

      context('when the token is not zero', () => {
        let token: TokenMock

        beforeEach('set token', async () => {
          token = await ethers.deployContract('TokenMock', ['TKN', 18])
          await token.mint(paymentsReceiver.target, fp(1000))
        })

        context('when the recipient is not zero', () => {
          const recipient = randomEvmAddress()

          context('when the amount is not zero', () => {
            const amount = fp(10)

            it('withdraws tokens correctly', async () => {
              const preContractBalance = await token.balanceOf(paymentsReceiver.target)
              const preRecipientBalance = await token.balanceOf(recipient)

              await paymentsReceiver.withdraw(token.target, recipient, amount)

              const postContractBalance = await token.balanceOf(paymentsReceiver.target)
              expect(postContractBalance).to.equal(preContractBalance - amount)

              const postRecipientBalance = await token.balanceOf(recipient)
              expect(postRecipientBalance).to.equal(preRecipientBalance + amount)
            })

            it('emits an event', async () => {
              await expect(paymentsReceiver.withdraw(token.target, recipient, amount))
                .to.emit(paymentsReceiver, 'Withdrawn')
                .withArgs(token.target, getAddress(recipient), amount)
            })
          })

          context('when the amount is zero', () => {
            it('reverts', async () => {
              await expect(paymentsReceiver.withdraw(token.target, recipient, 0)).to.be.revertedWithCustomError(
                paymentsReceiver,
                'PaymentsReceiverAmountZero'
              )
            })
          })
        })

        context('when the recipient is zero', () => {
          const recipient = ZERO_ADDRESS

          it('reverts', async () => {
            await expect(paymentsReceiver.withdraw(token.target, recipient, 0)).to.be.revertedWithCustomError(
              paymentsReceiver,
              'PaymentsReceiverRecipientZero'
            )
          })
        })
      })

      context('when the token is zero', () => {
        const token = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(paymentsReceiver.withdraw(token, ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(
            paymentsReceiver,
            'PaymentsReceiverTokenZero'
          )
        })
      })
    })

    context('when the sender is not the owner', () => {
      it('reverts', async () => {
        await expect(
          paymentsReceiver.connect(payer).withdraw(ZERO_ADDRESS, ZERO_ADDRESS, 0)
        ).to.be.revertedWithCustomError(
          paymentsReceiver,
          // eslint-disable-next-line no-secrets/no-secrets
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })
})
