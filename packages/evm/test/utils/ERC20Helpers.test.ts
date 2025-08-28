import { expect } from 'chai'
import { Contract } from 'ethers'
import { network } from 'hardhat'

const { ethers } = await network.connect()

import { NATIVE_TOKEN_ADDRESS, randomAddress, ZERO_ADDRESS } from '@mimicprotocol/sdk'

describe('ERC20Helpers', () => {
  let library: Contract
  const someone = randomAddress()

  beforeEach('deploy helpers', async () => {
    library = await ethers.deployContract('ERC20HelpersMock')
  })

  describe('balanceOf', () => {
    context('when the token is the native token', () => {
      const token = NATIVE_TOKEN_ADDRESS

      it('returns the account balance correctly', async () => {
        expect(await library.balanceOf(token, ZERO_ADDRESS)).to.be.eq(0)
        expect(await library.balanceOf(token, someone)).to.be.equal(await ethers.provider.getBalance(someone))
      })
    })

    context('when the token is an ERC20 token', () => {
      let token: Contract

      beforeEach('deploy token', async () => {
        token = await ethers.deployContract('TokenMock', ['TKN', 18])
        await token.mint(someone, 10)
      })

      it('returns the account balance correctly', async () => {
        expect(await library.balanceOf(token.target, ZERO_ADDRESS)).to.be.eq(0)
        expect(await library.balanceOf(token.target, someone)).to.be.equal(10)
      })
    })
  })

  describe('transfer', () => {
    const amount = BigInt(10)

    context('when the token is the native token', () => {
      const token = NATIVE_TOKEN_ADDRESS

      beforeEach('fund library', async () => {
        const [signer] = await ethers.getSigners()
        await signer.sendTransaction({ to: library.target, value: amount })
      })

      it('transfers value correctly', async () => {
        const previousLibraryBalance = await library.balanceOf(token, library.target)
        const previousRecipientBalance = await library.balanceOf(token, someone)

        await library.transfer(token, someone, amount)

        const currentLibraryBalance = await library.balanceOf(token, library.target)
        expect(currentLibraryBalance).to.be.equal(previousLibraryBalance - amount)

        const currentRecipientBalance = await library.balanceOf(token, someone)
        expect(currentRecipientBalance).to.be.equal(previousRecipientBalance + amount)
      })
    })

    context('when the token is an ERC20 token', () => {
      let token: Contract

      beforeEach('deploy token', async () => {
        token = await ethers.deployContract('TokenMock', ['TKN', 18])
      })

      beforeEach('fund library', async () => {
        await token.mint(library.target, amount)
      })

      it('transfers tokens correctly', async () => {
        const previousLibraryBalance = await library.balanceOf(token.target, library.target)
        const previousRecipientBalance = await library.balanceOf(token.target, someone)

        await library.transfer(token.target, someone, amount)

        const currentLibraryBalance = await library.balanceOf(token.target, library.target)
        expect(currentLibraryBalance).to.be.equal(previousLibraryBalance - amount)

        const currentRecipientBalance = await library.balanceOf(token.target, someone)
        expect(currentRecipientBalance).to.be.equal(previousRecipientBalance + amount)
      })
    })
  })

  describe('approve', () => {
    context('when the token is the native token', () => {
      const token = NATIVE_TOKEN_ADDRESS

      it('reverts', async () => {
        await expect(library.approve(token, someone, 10)).to.be.reverted
      })
    })

    context('when the token is an ERC20 token', () => {
      let token: Contract

      beforeEach('deploy token', async () => {
        token = await ethers.deployContract('TokenMock', ['TKN', 18])
      })

      it('updates allowance correctly', async () => {
        await library.approve(token.target, someone, 10)
        expect(await token.allowance(library.target, someone)).to.be.equal(10)

        await library.approve(token.target, someone, 20)
        expect(await token.allowance(library.target, someone)).to.be.equal(20)

        await library.approve(token.target, someone, 0)
        expect(await token.allowance(library.target, someone)).to.be.equal(0)
      })
    })
  })
})
