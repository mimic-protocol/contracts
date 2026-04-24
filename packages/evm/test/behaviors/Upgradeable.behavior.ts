import { HardhatEthers } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { Contract, getAddress } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const ERC1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

export default function itBehavesLikeUpgradeable(): void {
  describe('initialize', () => {
    it('locks the implementation initializer', async function () {
      const implementation = await this.ethers.deployContract(this.implementationNameV1)

      await expect(implementation.initialize(...this.initializeArgs)).to.be.revertedWithCustomError(
        implementation,
        'InvalidInitialization'
      )
    })

    it('cannot be initialized twice', async function () {
      await expect(this.proxy.initialize(...this.initializeArgs)).to.be.revertedWithCustomError(
        this.proxy,
        'InvalidInitialization'
      )
    })
  })

  describe('upgradeAndCall', () => {
    context('when the sender is the owner', () => {
      it('upgrades the implementation', async function () {
        const proxyAdmin = await getProxyAdmin(this.ethers, this.proxy)
        const newImplementation = await this.ethers.deployContract(this.implementationNameV2)

        await proxyAdmin.connect(this.proxyOwner).upgradeAndCall(this.proxy, newImplementation, '0x')
        await this.assertUpgrade(this.proxy)
      })
    })

    context('when the sender is not the owner', () => {
      it('reverts', async function () {
        const proxyAdmin = await getProxyAdmin(this.ethers, this.proxy)
        const newImplementation = await this.ethers.deployContract(this.implementationNameV2)

        await expect(
          proxyAdmin.connect(this.other).upgradeAndCall(this.proxy, newImplementation, '0x')
        ).to.be.revertedWithCustomError(proxyAdmin, 'OwnableUnauthorizedAccount')
      })
    })
  })
}

async function getProxyAdmin(ethers: HardhatEthers, proxy: Contract): Promise<Contract> {
  const rawAdmin = await ethers.provider.getStorage(proxy.target as string, ERC1967_ADMIN_SLOT)
  return new Contract(
    getAddress(`0x${rawAdmin.slice(-40)}`),
    [
      'error OwnableUnauthorizedAccount(address account)',
      'function upgradeAndCall(address proxy, address implementation, bytes data) payable',
    ],
    ethers.provider
  )
}
