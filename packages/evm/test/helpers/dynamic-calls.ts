import { AbiCoder } from 'ethers'

export type DynamicArg = { kind: number; data: string }

export function literal(types: string[], values: any[]): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['string', ...types], ['', ...values])
  return { kind: 0, data }
}

export function variable(index: number): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['uint256'], [index])
  return { kind: 1, data }
}

export function staticCall(target: string, selector: string, args: DynamicArg[]) {
  const data = AbiCoder.defaultAbiCoder().encode(
    ['tuple(address target, bytes4 selector, tuple(uint8 kind, bytes data)[] arguments)'],
    [{ target, selector, arguments: args }]
  )
  return { kind: 2, data }
}
