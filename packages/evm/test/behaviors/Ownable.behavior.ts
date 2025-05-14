import { getSigner } from '@mimic-fi/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'

export default function itBehavesLikeOwnable(): void {
  let other: SignerWithAddress

  beforeEach('set other', async function () {
    other = await getSigner()
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
      beforeEach('set sender', async function () {
        this.ownable = this.ownable.connect(other)
      })

      it('reverts', async function () {
        // eslint-disable-next-line no-secrets/no-secrets
        await expect(this.ownable.transferOwnership(other.address)).to.be.revertedWith('OwnableUnauthorizedAccount')
      })
    })
  })
}
