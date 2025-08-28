import { expect } from 'chai'
import { Contract } from 'ethers'
import { network } from 'hardhat'

const { ethers } = await network.connect()

import { NATIVE_TOKEN_ADDRESS, USD_ADDRESS } from '@mimicprotocol/sdk'

describe('Denominations', () => {
  let library: Contract

  beforeEach('deploy lib', async () => {
    library = await ethers.deployContract('DenominationsMock')
  })

  it('uses the expected native token address', async () => {
    expect(await library.NATIVE_TOKEN()).to.be.equal(NATIVE_TOKEN_ADDRESS)
  })

  it('uses the expected USD denomination address', async () => {
    expect(await library.USD()).to.be.equal(USD_ADDRESS)
  })
})
