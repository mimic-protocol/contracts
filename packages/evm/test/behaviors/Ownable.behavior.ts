import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { network } from 'hardhat'

const { ethers } = await network.connect()

export default function itBehavesLikeOwnable(): void {
  let other: HardhatEthersSigner

  beforeEach('set other', async function () {
    // eslint-disable-next-line prettier/prettier
    [other] = await ethers.getSigners();
  })

  describe('owner', () => {
    it('sets the initial owner correctly', async function () {
      const actualOwner = await this.ownable.owner()
      expect(actualOwner).to.be.equal(this.owner.address)
    })
  })

  describe('transferOwnership', () => {
    context('when the sender is the owner', () => {
      beforeEach('set sender', async function () {
        this.ownable = this.ownable.connect(this.owner)
      })

      it('transfers ownership', async function () {
        await this.ownable.transferOwnership(other.address)
        expect(await this.ownable.owner()).to.be.equal(other.address)
      })
    })

    context('when the sender is not the owner', () => {
      it('reverts', async function () {
        await expect(this.ownable.transferOwnership(other.address)).to.be.revertedWithCustomError(
          this.ownable,
          // eslint-disable-next-line no-secrets/no-secrets
          'OwnableUnauthorizedAccount'
        )
      })
    })
  })
}
