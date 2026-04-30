import { expect } from 'chai'
import { AbiCoder } from 'ethers'
import { network } from 'hardhat'

import { BytesHelpersMock } from '../../types/ethers-contracts/index.js'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('BytesHelpers', () => {
  let library: BytesHelpersMock

  beforeEach('deploy helpers mock', async () => {
    library = await ethers.deployContract('BytesHelpersMock')
  })

  describe('readWord0', () => {
    context('when data is 32 bytes', () => {
      const word = 123n
      const data = AbiCoder.defaultAbiCoder().encode(['uint256'], [word])

      it('returns the first word', async () => {
        expect(await library.readWord0(data)).to.equal(word)
      })
    })

    context('when data is longer than 32 bytes', () => {
      const a = 999n
      const b = 555n
      const data = AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [a, b])

      it('returns the first word', async () => {
        expect(await library.readWord0(data)).to.equal(a)
      })
    })
  })

  describe('readWord1', () => {
    context('when data is 64 bytes', () => {
      const a = 999n
      const b = 555n
      const data = AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [a, b])

      it('returns the second word', async () => {
        expect(await library.readWord1(data)).to.equal(b)
      })
    })

    context('when data is longer than 64 bytes', () => {
      const a = 999n
      const b = 555n
      const c = 111n
      const data = AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256', 'uint256'], [a, b, c])

      it('returns the second word', async () => {
        expect(await library.readWord1(data)).to.equal(b)
      })
    })
  })

  describe('slice(bytes)', () => {
    const data = '0x00112233445566778899aabbccddeeff'

    context('when slicing the full range', () => {
      it('returns the same bytes', async () => {
        const out = await library.slice(data, 0, (data.length - 2) / 2)
        expect(out).to.equal(data)
      })
    })

    context('when slicing a middle range', () => {
      it('returns the expected bytes', async () => {
        const out = await library.slice(data, 2, 6)
        expect(out).to.equal('0x22334455')
      })
    })

    context('when slicing an empty range', () => {
      it('returns empty bytes', async () => {
        const out = await library.slice(data, 5, 5)
        expect(out).to.equal('0x')
      })
    })

    context('when end is smaller than start', () => {
      it('reverts', async () => {
        await expect(library.slice(data, 6, 2)).to.be.revertedWithCustomError(library, 'BytesLibSliceOutOfBounds')
      })
    })

    context('when end is out of bounds', () => {
      it('reverts', async () => {
        const len = (data.length - 2) / 2
        await expect(library.slice(data, 0, len + 1)).to.be.revertedWithCustomError(library, 'BytesLibSliceOutOfBounds')
      })
    })

    context('when start equals length and end equals length', () => {
      it('returns empty bytes', async () => {
        const len = (data.length - 2) / 2
        const out = await library.slice(data, len, len)
        expect(out).to.equal('0x')
      })
    })
  })

  describe('sliceFrom', () => {
    const data = '0x00112233445566778899aabbccddeeff'

    context('when start is 0', () => {
      it('returns the same bytes', async () => {
        const out = await library.sliceFrom(data, 0)
        expect(out).to.equal(data)
      })
    })

    context('when start is in the middle', () => {
      it('returns the expected bytes', async () => {
        const out = await library.sliceFrom(data, 4)
        expect(out).to.equal('0x445566778899aabbccddeeff')
      })
    })

    context('when start equals length', () => {
      it('returns empty bytes', async () => {
        const len = (data.length - 2) / 2
        const out = await library.sliceFrom(data, len)
        expect(out).to.equal('0x')
      })
    })

    context('when start is out of bounds', () => {
      it('reverts', async () => {
        const len = (data.length - 2) / 2
        await expect(library.sliceFrom(data, len + 1)).to.be.revertedWithCustomError(
          library,
          'BytesLibSliceOutOfBounds'
        )
      })
    })
  })
})
