import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import { network } from 'hardhat'

const { ethers } = await network.connect()

import { CallMock, SmartAccount, TokenMock } from '../types/ethers-contracts/index.js'
import itBehavesLikeOwnable from './behaviors/Ownable.behavior'
import {
  BigNumberish,
  fp,
  NATIVE_TOKEN_ADDRESS,
  randomAddress,
  randomHex,
  toAddress,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from './helpers'

/* eslint-disable no-secrets/no-secrets */

describe('SmartAccount', () => {
  let smartAccount: SmartAccount
  let owner: HardhatEthersSigner, settler: HardhatEthersSigner, other: HardhatEthersSigner

  const allowedAccounts = [randomAddress(), randomAddress()]

  beforeEach('deploy smart account', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, settler, other] = await ethers.getSigners()
    smartAccount = await ethers.deployContract('SmartAccount', [settler.address, owner.address, allowedAccounts])
  })

  describe('ownable', () => {
    beforeEach('set instance', function () {
      this.owner = owner
      this.ownable = smartAccount
    })

    itBehavesLikeOwnable()
  })

  describe('initialization', () => {
    it('has a reference to the settler', async () => {
      expect(await smartAccount.settler()).to.be.equal(settler.address)
    })

    it('initializes permissions properly', async () => {
      for (const address of allowedAccounts) {
        expect(await smartAccount.hasPermission(address)).to.be.true
      }
    })
  })

  describe('ERC165', () => {
    it('supports the ISmartAccount interface', async () => {
      const interfaceId = '0xcbec194e' // ISmartAccount

      expect(await smartAccount.supportsInterface(interfaceId)).to.be.true
    })

    it('supports the IERC165 interface', async () => {
      const interfaceId = '0x01ffc9a7' // IERC165

      expect(await smartAccount.supportsInterface(interfaceId)).to.be.true
    })

    it('does not support random interfaces', async () => {
      const interfaceId = randomHex(4)

      expect(await smartAccount.supportsInterface(interfaceId)).to.be.false
    })
  })

  describe('receive', () => {
    const value = 1

    it('accepts native tokens', async () => {
      await owner.sendTransaction({ to: smartAccount.target, value })

      expect(await ethers.provider.getBalance(smartAccount.target)).to.be.equal(value)
    })
  })

  describe('transfer', () => {
    context('when the sender is authorized', () => {
      let token: TokenMock | string
      const amount = fp(10)
      const recipient = randomAddress()

      const itEmitsAnEvent = () => {
        it('emits an event', async () => {
          const tx = await smartAccount.transfer(toAddress(token), recipient, amount)

          const events = await smartAccount.queryFilter(smartAccount.filters.Transferred(), tx.blockNumber)
          expect(events).to.have.lengthOf(1)

          expect(events[0].args.token).to.be.equal(toAddress(token))
          expect(events[0].args.amount).to.be.equal(amount)
          expect(events[0].args.recipient).to.be.equal(getAddress(recipient))
        })
      }

      const itWorksProperly = () => {
        context('when the token is an ERC20', () => {
          beforeEach('set token', async () => {
            token = await ethers.deployContract('TokenMock', ['TKN', 18])
          })

          beforeEach('fund smart account', async () => {
            await token.mint(smartAccount.target, amount * BigInt(5))
          })

          it('transfers the tokens to the recipient', async () => {
            const preSmartAccountBalance = await token.balanceOf(smartAccount)
            const preRecipientBalance = await token.balanceOf(recipient)

            await smartAccount.transfer(token, recipient, amount)

            const postSmartAccountBalance = await token.balanceOf(smartAccount)
            expect(postSmartAccountBalance).to.be.eq(preSmartAccountBalance - amount)

            const postRecipientBalance = await token.balanceOf(recipient)
            expect(postRecipientBalance).to.be.equal(preRecipientBalance + amount)
          })

          itEmitsAnEvent()
        })

        context('when the token is the native token', () => {
          beforeEach('set token', async () => {
            token = NATIVE_TOKEN_ADDRESS
          })

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: smartAccount.target, value: amount * BigInt(2) })
          })

          it('transfers the tokens to the recipient', async () => {
            const preSmartAccountBalance = await ethers.provider.getBalance(smartAccount)
            const preRecipientBalance = await ethers.provider.getBalance(recipient)

            await smartAccount.transfer(token, recipient, amount)

            const postSmartAccountBalance = await ethers.provider.getBalance(smartAccount)
            expect(postSmartAccountBalance).to.be.eq(preSmartAccountBalance - amount)

            const postRecipientBalance = await ethers.provider.getBalance(recipient)
            expect(postRecipientBalance).to.be.equal(preRecipientBalance + amount)
          })

          itEmitsAnEvent()
        })
      }

      context('when the sender is the owner', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(owner)
        })

        itWorksProperly()
      })

      context('when the sender is the settler', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(settler)
        })

        itWorksProperly()
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartAccount = smartAccount.connect(other)
      })

      it('reverts', async () => {
        await expect(smartAccount.transfer(ZERO_ADDRESS, ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(
          smartAccount,
          'SmartAccountUnauthorizedSender'
        )
      })
    })
  })

  describe('call', () => {
    context('when the sender is authorized', () => {
      let target: CallMock

      beforeEach('deploy call mock', async () => {
        target = await ethers.deployContract('CallMock')
      })

      const _itWorksProperly = (value: BigNumberish) => {
        context('when the call succeeds', () => {
          let data: string

          beforeEach('encode call', async () => {
            data = target.interface.encodeFunctionData('call')
          })

          it('calls the target contract', async () => {
            const tx = await smartAccount.call(target.target, data, value)

            const events = await smartAccount.queryFilter(smartAccount.filters.Called(), tx.blockNumber)
            expect(events).to.have.lengthOf(1)

            expect(events[0].args.target).to.be.equal(target.target)
            expect(events[0].args.data).to.be.equal(data)
            expect(events[0].args.result).to.be.equal('0x')
            expect(events[0].args.value).to.be.equal(value)

            const indirectEvents = await target.queryFilter(target.filters.CallReceived(), tx.blockNumber)
            expect(indirectEvents).to.have.lengthOf(1)

            expect(indirectEvents[0].args.sender).to.be.equal(smartAccount.target)
            expect(indirectEvents[0].args.value).to.be.equal(value)
          })
        })

        context('when the call does not succeeds', () => {
          const data = randomHex(32)

          it('reverts', async () => {
            await expect(smartAccount.call(target.target, data, 0)).to.be.revertedWithCustomError(
              smartAccount,
              'FailedCall'
            )
          })
        })
      }

      const itWorksProperly = () => {
        context('when the value is 0', () => {
          _itWorksProperly(0)
        })

        context('when the value is greater than 0', () => {
          const value = 100

          beforeEach('fund smart account', async () => {
            await owner.sendTransaction({ to: smartAccount.target, value: value * 10 })
          })

          _itWorksProperly(value)
        })
      }

      context('when the sender is the owner', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(owner)
        })

        itWorksProperly()
      })

      context('when the sender is the settler', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(settler)
        })

        itWorksProperly()
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        smartAccount = smartAccount.connect(other)
      })

      it('reverts', async () => {
        await expect(smartAccount.call(ZERO_ADDRESS, ZERO_BYTES32, 0)).to.be.revertedWithCustomError(
          smartAccount,
          'SmartAccountUnauthorizedSender'
        )
      })
    })
  })

  describe('setPermissions', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', () => {
        smartAccount = smartAccount.connect(owner)
      })

      context('when the inputs lengths match', () => {
        const accounts = [randomAddress(), randomAddress(), randomAddress()].map((a) => getAddress(a))
        const alloweds = [true, true, false]

        const itSetsThePermissionsProperly = () => {
          it('sets the permissions properly', async () => {
            await smartAccount.setPermissions(accounts, alloweds)

            for (const [i, account] of accounts.entries()) {
              const value = alloweds[i]
              expect(await smartAccount.hasPermission(account)).to.be.equal(value)
            }
          })

          it('emits the corresponding events', async () => {
            const tx = await smartAccount.setPermissions(accounts, alloweds)

            const events = await smartAccount.queryFilter(smartAccount.filters['PermissionSet'](), tx.blockNumber)
            expect(events).to.have.lengthOf(accounts.length)

            for (const [i, account] of accounts.entries()) {
              const value = alloweds[i]
              expect(events[i].args.account).to.equal(account)
              expect(events[i].args.allowed).to.equal(value)
            }
          })
        }

        context('when setting the permissions for the first time', () => {
          itSetsThePermissionsProperly()
        })

        context('when the permissions were already set', () => {
          beforeEach('set permissions', async () => {
            await smartAccount.setPermissions([accounts[0]], [!alloweds[0]])
          })

          itSetsThePermissionsProperly()
        })
      })

      context('when the inputs lengths do not match', () => {
        it('reverts', async () => {
          await expect(smartAccount.setPermissions([], [true])).to.be.revertedWithCustomError(
            smartAccount,
            'SmartAccountInputInvalidLength'
          )
        })
      })
    })

    context('when the sender is not authorized', () => {
      const itReverts = () => {
        it('reverts', async () => {
          await expect(smartAccount.setPermissions([], [])).to.be.revertedWithCustomError(
            smartAccount,
            'OwnableUnauthorizedAccount'
          )
        })
      }

      context('when the sender is the settler', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(settler)
        })

        itReverts()
      })

      context('when the sender is an unknown account', () => {
        beforeEach('set sender', () => {
          smartAccount = smartAccount.connect(other)
        })

        itReverts()
      })
    })
  })
})
