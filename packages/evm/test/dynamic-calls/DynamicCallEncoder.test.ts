import { randomEvmAddress } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { network } from 'hardhat'

import { DynamicCallEncoder, StaticCallMock } from '../../types/ethers-contracts/index.js'
import { DynamicArg, literal, staticCall, variable } from '../helpers'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */

describe('DynamicCallEncoder', () => {
  let encoder: DynamicCallEncoder

  beforeEach('deploy contract', async () => {
    encoder = await ethers.deployContract('DynamicCallEncoder')
  })

  const iface = new ethers.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)',
    'function foo(uint256[])',
  ])

  function dynamicCall(method: string, args: DynamicArg[]) {
    return {
      target: randomEvmAddress(),
      value: 0n,
      selector: iface.getFunction(method)!.selector,
      arguments: args,
    }
  }

  describe('encode', () => {
    context('with literal arguments', () => {
      const variables: string[][] = []

      context('with a single argument', () => {
        const owner = randomEvmAddress()
        const call = dynamicCall('balanceOf', [literal(['address'], [owner])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [owner]))
        })
      })

      context('with multiple arguments', () => {
        const to = randomEvmAddress()
        const amount = 999n
        const call = dynamicCall('transfer', [literal(['address'], [to]), literal(['uint256'], [amount])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, amount]))
        })
      })

      context('with arbitrary-length arguments', () => {
        const values = [1n, 2n, 3n]
        const call = dynamicCall('foo', [literal(['uint256[]'], [values])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('foo', [values]))
        })
      })
    })

    context('with variable arguments', () => {
      context('when the variable spec is correct', () => {
        const var0 = 100n
        const var1 = randomEvmAddress()
        const var2 = [1, 2, 3, 4, 5, 6, 7]

        // variables[opIndex][subIndex]
        const variables = [
          [
            ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [var0]),
            ethers.AbiCoder.defaultAbiCoder().encode(['address'], [var1]),
          ],
          [ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'], [var2])],
        ]

        context('with a single argument', () => {
          const call = dynamicCall('balanceOf', [variable(0, 1)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [var1]))
          })
        })

        context('with multiple arguments', () => {
          const to = randomEvmAddress()
          const call = dynamicCall('transfer', [literal(['address'], [to]), variable(0, 0)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, var0]))
          })
        })

        context('with arbitrary-length arguments', () => {
          const call = dynamicCall('foo', [variable(1, 0)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('foo', [var2]))
          })
        })
      })

      context('when the variable spec is invalid', () => {
        context('when variable ref is not 64 bytes', () => {
          const call = dynamicCall('foo', [{ kind: 1, data: '0x11' }])

          it('reverts with DynamicCallEncoderVariableRefBadLength', async () => {
            await expect(encoder.encode(call, [])).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableRefBadLength'
            )
          })
        })

        context('when operation index is out of bounds', () => {
          const call = dynamicCall('foo', [variable(0, 0)])

          it('reverts with DynamicCallEncoderVariableOutOfBounds', async () => {
            await expect(encoder.encode(call, [])).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableOutOfBounds'
            )
          })
        })

        context('when sub-index is out of bounds', () => {
          const variables = [[ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [1n])]]
          const call = dynamicCall('foo', [variable(0, 1)])

          it('reverts with DynamicCallEncoderVariableOutOfBounds', async () => {
            await expect(encoder.encode(call, variables)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableOutOfBounds'
            )
          })
        })

        context('when variable bytes are too short to be static', () => {
          const variables = [['0x1234']]
          const call = dynamicCall('transfer', [literal(['address'], [randomEvmAddress()]), variable(0, 0)])

          it('reverts with DynamicCallEncoderVariableTooShort', async () => {
            await expect(encoder.encode(call, variables)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableTooShort'
            )
          })
        })
      })
    })

    context('with staticcall arguments', () => {
      let mock: StaticCallMock

      beforeEach('deploy static call mock', async () => {
        mock = await ethers.deployContract('StaticCallMock')
      })

      context('when the staticcall receives a literal', () => {
        context('with fixed-length return types', () => {
          it('encodes arguments properly', async () => {
            const to = randomEvmAddress()
            const amount = 999n

            const call = dynamicCall('transfer', [
              staticCall(mock.target, mock.interface.getFunction('returnAddress')!.selector, [
                literal(['address'], [to]),
              ]),
              literal(['uint256'], [amount]),
            ])
            const encoded = await encoder.encode(call, [])
            expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, amount]))
          })
        })

        context('with arbitrary-length return types', () => {
          it('encodes arguments properly', async () => {
            const values = [1n, 2n, 3n]

            const call = dynamicCall('foo', [
              staticCall(mock.target, mock.interface.getFunction('returnArray')!.selector, [
                literal(['uint256[]'], [values]),
              ]),
            ])

            const encoded = await encoder.encode(call, [])
            expect(encoded).to.equal(iface.encodeFunctionData('foo', [values]))
          })
        })
      })

      context('when the staticcall receives a variable', () => {
        it('encodes arguments properly', async () => {
          const owner = randomEvmAddress()
          const variables = [[ethers.AbiCoder.defaultAbiCoder().encode(['address'], [owner])]]

          const call = dynamicCall('balanceOf', [
            staticCall(mock.target, mock.interface.getFunction('returnAddress')!.selector, [variable(0, 0)]),
          ])

          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [owner]))
        })
      })

      context('when the staticcall receives the result of another staticcall', () => {
        it('encodes arguments properly', async () => {
          const to = randomEvmAddress()

          const call = dynamicCall('balanceOf', [
            staticCall(mock.target, mock.interface.getFunction('returnAddress')!.selector, [
              staticCall(mock.target, mock.interface.getFunction('returnAddress')!.selector, [
                literal(['address'], [to]),
              ]),
            ]),
          ])

          const encoded = await encoder.encode(call, [])
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [to]))
        })
      })
    })
  })
})
