import { randomEvmAddress } from '@mimicprotocol/sdk'
import { expect } from 'chai'
import { network } from 'hardhat'

import { DynamicCallEncoder } from '../../types/ethers-contracts/index.js'
import { DynamicArg, literal, variable } from '../helpers'

const { ethers } = await network.connect()

/* eslint-disable no-secrets/no-secrets */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe('DynamicCallEncoder', () => {
  let encoder: DynamicCallEncoder

  beforeEach('deploy contract', async () => {
    encoder = await ethers.deployContract('DynamicCallEncoder')
  })

  const iface = new ethers.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)',
    'function foo(uint256[])',
    'function number(uint256 value) view returns (uint256)',
    'function bar(uint256[2])',
    'function baz((uint256,address))',
    'function qux(uint256,uint256[2])',
    'function nested((uint256[],uint256[2],(address,uint256)[])[])',
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
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [owner]))
        })
      })

      context('with multiple arguments', () => {
        const to = randomEvmAddress()
        const amount = 999n
        const call = dynamicCall('transfer', [literal(['address'], [to]), literal(['uint256'], [amount])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, amount]))
        })
      })

      context('with arbitrary-length arguments', () => {
        const values = [1n, 2n, 3n]
        const call = dynamicCall('foo', [literal(['uint256[]'], [values], true)])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('foo', [values]))
        })
      })

      context('when a static uint256 equals an ABI dynamic offset', () => {
        const value = 96n
        const call = dynamicCall('number', [literal(['uint256'], [value])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('number', [value]))
        })
      })

      context('when a static address equals an ABI dynamic offset', () => {
        const value = '0x0000000000000000000000000000000000000060'
        const call = dynamicCall('balanceOf', [literal(['address'], [value])])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [value]))
        })
      })

      context('with an array of structs containing nested arrays', () => {
        const values = [
          [
            [1n, 2n, 3n],
            [4n, 5n],
            [
              [randomEvmAddress(), 6n],
              [randomEvmAddress(), 7n],
            ],
          ],
          [[8n, 9n], [10n, 11n], [[randomEvmAddress(), 12n]]],
        ]
        const call = dynamicCall('nested', [
          literal(['tuple(uint256[],uint256[2],tuple(address,uint256)[])[]'], [values], true),
        ])

        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables, variables.length)
          expect(encoded).to.equal(iface.encodeFunctionData('nested', [values]))
        })
      })
    })

    context('with variable arguments', () => {
      context('when the variable spec is correct', () => {
        const var0 = 100n
        const var1 = randomEvmAddress()
        const var2 = [1, 2, 3, 4, 5, 6, 7]
        const var3 = [11n, 22n]
        const var4 = [33n, randomEvmAddress()]
        const var5 = [32n, 99n]
        const var6 = [
          [
            [1n, 2n, 3n],
            [4n, 5n],
            [
              [randomEvmAddress(), 6n],
              [randomEvmAddress(), 7n],
            ],
          ],
          [[], [10n, 11n], [[randomEvmAddress(), 12n]]],
        ]

        // variables[opIndex][subIndex]
        const variables = [
          [
            ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [var0]),
            ethers.AbiCoder.defaultAbiCoder().encode(['address'], [var1]),
          ],
          [
            ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'], [var2]),
            ethers.AbiCoder.defaultAbiCoder().encode(['uint256[2]'], [var3]),
            ethers.AbiCoder.defaultAbiCoder().encode(['tuple(uint256,address)'], [var4]),
            ethers.AbiCoder.defaultAbiCoder().encode(['uint256[2]'], [var5]),
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['tuple(uint256[],uint256[2],tuple(address,uint256)[])[]'],
              [var6]
            ),
          ],
        ]

        context('with a single argument', () => {
          const call = dynamicCall('balanceOf', [variable(0, 1)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [var1]))
          })
        })

        context('with multiple arguments', () => {
          const to = randomEvmAddress()
          const call = dynamicCall('transfer', [literal(['address'], [to]), variable(0, 0)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, var0]))
          })
        })

        context('with arbitrary-length arguments', () => {
          const call = dynamicCall('foo', [variable(1, 0, true)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('foo', [var2]))
          })
        })

        context('with multi-word static arguments', () => {
          const call = dynamicCall('bar', [variable(1, 1)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('bar', [var3]))
          })
        })

        context('with static tuple arguments', () => {
          const call = dynamicCall('baz', [variable(1, 2)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('baz', [var4]))
          })
        })

        context('when a static value starts with an ABI dynamic offset', () => {
          const value = 1n
          const call = dynamicCall('qux', [literal(['uint256'], [value]), variable(1, 3)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('qux', [value, var5]))
          })
        })

        context('with an array of structs containing nested arrays', () => {
          const call = dynamicCall('nested', [variable(1, 4, true)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables, variables.length)
            expect(encoded).to.equal(iface.encodeFunctionData('nested', [var6]))
          })
        })
      })

      context('when the variable spec is invalid', () => {
        context('when variable ref is not 64 bytes', () => {
          const call = dynamicCall('foo', [{ kind: 1, data: '0x11', isDynamic: false }])

          it('reverts with DynamicCallEncoderVariableRefBadLength', async () => {
            await expect(encoder.encode(call, [], 0)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableRefBadLength'
            )
          })
        })

        context('when operation index is out of bounds', () => {
          const var0 = [ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [1n])]
          const variables = [var0, var0] // variables.length = 2
          const variablesLength = 1
          const call = dynamicCall('foo', [variable(1, 0)])

          it('reverts with DynamicCallEncoderVariableOutOfBounds', async () => {
            await expect(encoder.encode(call, variables, variablesLength)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableOutOfBounds'
            )
          })
        })

        context('when sub-index is out of bounds', () => {
          const variables = [[ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [1n])]]
          const call = dynamicCall('foo', [variable(0, 1)])

          it('reverts with DynamicCallEncoderVariableOutOfBounds', async () => {
            await expect(encoder.encode(call, variables, variables.length)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableOutOfBounds'
            )
          })
        })

        context('when variable bytes are not word-aligned', () => {
          const variables = [['0x1234']]
          const call = dynamicCall('transfer', [literal(['address'], [randomEvmAddress()]), variable(0, 0)])

          it('reverts with DynamicCallEncoderBadLength', async () => {
            await expect(encoder.encode(call, variables, variables.length)).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderBadLength'
            )
          })
        })
      })
    })

    context('when variables length exceeds the variables array length', () => {
      const variables = [[ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [1n])]]
      const call = dynamicCall('foo', [variable(0, 0)])

      it('reverts with DynamicCallEncoderVariablesLengthOutOfBounds', async () => {
        await expect(encoder.encode(call, variables, variables.length + 1)).to.be.revertedWithCustomError(
          encoder,
          'DynamicCallEncoderVariablesLengthOutOfBounds'
        )
      })
    })
  })
})
