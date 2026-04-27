import { AbiCoder } from 'ethers'

export type DynamicArg = { kind: number; data: string; isDynamic: boolean }

export function literal(types: string[], values: any[], isDynamic = false): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(types, values)
  return { kind: 0, isDynamic, data }
}

export function variable(index: number, isDynamic = false): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['uint256'], [index])
  return { kind: 1, isDynamic, data }
}

export function staticCall(target: string, selector: string, args: DynamicArg[], isDynamic = false): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(
    ['tuple(address target, bytes4 selector, tuple(uint8 kind, bool isDynamic, bytes data)[] arguments)'],
    [{ target, selector, arguments: args }]
  )

  return { kind: 2, isDynamic, data }
}
