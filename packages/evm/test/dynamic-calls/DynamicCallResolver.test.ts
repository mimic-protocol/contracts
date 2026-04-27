import { randomEvmAddress, randomNumber } from '@mimicprotocol/sdk'
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
    'function number(uint256 value) view returns (uint256)',
    'function bar(uint256[2])',
    'function baz((uint256,address))',
    'function qux(uint256,uint256[2])',
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
      const variables: string[] = []

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

      context.only('with uint256 96', () => {
        // misclassified as dynamic

        const val = 96n
        const call = dynamicCall('number', [literal(['uint256'], [val])])
        
        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('number', [val]))
        })
      })

      context.only('with address 0x60', () => {
        // misclassified as dynamic

        const val = '0x0000000000000000000000000000000000000060'
        const call = dynamicCall('balanceOf', [literal(['address'], [val])])
        
        it('encodes arguments properly', async () => {
          const encoded = await encoder.encode(call, variables)
          expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [val]))
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

        const variables = [
          ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [var0]),
          ethers.AbiCoder.defaultAbiCoder().encode(['address'], [var1]),
          ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'], [var2]),
          ethers.AbiCoder.defaultAbiCoder().encode(['uint256[2]'], [var3]),
          ethers.AbiCoder.defaultAbiCoder().encode(['tuple(uint256,address)'], [var4]),
          ethers.AbiCoder.defaultAbiCoder().encode(['uint256[2]'], [var5]),
        ]

        context('with a single argument', () => {
          const call = dynamicCall('balanceOf', [variable(1)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('balanceOf', [var1]))
          })
        })

        context('with multiple arguments', () => {
          const to = randomEvmAddress()
          const call = dynamicCall('transfer', [literal(['address'], [to]), variable(0)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('transfer', [to, var0]))
          })
        })

        context('with arbitrary-length arguments', () => {
          const call = dynamicCall('foo', [variable(2)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('foo', [var2]))
          })
        })

        context.only('with multi-word static arguments', () => {
          // uint256[2] variable only encodes the first word: 11, missing 22

          const call = dynamicCall('bar', [variable(3)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('bar', [var3]))
          })
        })

        context.only('with static tuple arguments', () => {
          // static tuple variable only encodes the first word: 33, missing the address

          const call = dynamicCall('baz', [variable(4)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('baz', [var4]))
          })
        })

        context.only('when a static value starts with 0x20', () => {
          // static array beginning with 0x20 (32n) is misclassified as dynamic

          const val = 1n
          const call = dynamicCall('qux', [literal(['uint256'], [val]), variable(5)])

          it('encodes arguments properly', async () => {
            const encoded = await encoder.encode(call, variables)
            expect(encoded).to.equal(iface.encodeFunctionData('qux', [val, var5]))
          })
        })
      })

      context('when the variable spec is invalid', () => {
        context('when variable ref is not 32 bytes', () => {
          const call = dynamicCall('foo', [{ kind: 1, data: '0x11' }])

          it('reverts with DynamicCallEncoderVariableRefBadLength', async () => {
            await expect(encoder.encode(call, [])).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableRefBadLength'
            )
          })
        })

        context('when variable index is out of bounds', () => {
          const call = dynamicCall('foo', [variable(0)])

          it('reverts with DynamicCallEncoderVariableOutOfBounds', async () => {
            await expect(encoder.encode(call, [])).to.be.revertedWithCustomError(
              encoder,
              'DynamicCallEncoderVariableOutOfBounds'
            )
          })
        })

        context('when variable bytes are too short to be static', () => {
          const variables = ['0x1234']
          const call = dynamicCall('transfer', [literal(['address'], [randomEvmAddress()]), variable(0)])

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
          const variables = [ethers.AbiCoder.defaultAbiCoder().encode(['address'], [owner])]

          const call = dynamicCall('balanceOf', [
            staticCall(mock.target, mock.interface.getFunction('returnAddress')!.selector, [variable(0)]),
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
