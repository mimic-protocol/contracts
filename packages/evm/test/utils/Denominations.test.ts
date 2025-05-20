import { expect } from 'chai'
import { Contract } from 'ethers'
import { network } from 'hardhat'

const { ethers } = await network.connect()

import { NATIVE_TOKEN_ADDRESS } from '../helpers'

describe('Denominations', () => {
  let library: Contract

  beforeEach('deploy lib', async () => {
    library = await ethers.deployContract('DenominationsMock')
  })

  it('uses the expected native token address', async () => {
    expect(await library.NATIVE_TOKEN()).to.be.equal(NATIVE_TOKEN_ADDRESS)
  })
})
