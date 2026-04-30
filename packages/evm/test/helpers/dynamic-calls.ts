import { AbiCoder } from 'ethers'

export type DynamicArg = { kind: number; data: string; isDynamic: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function literal(types: string[], values: any[], isDynamic = false): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(types, values)
  return { kind: 0, data, isDynamic }
}

export function variable(opIndex: number, subIndex: number, isDynamic = false): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [opIndex, subIndex])
  return { kind: 1, data, isDynamic }
}
