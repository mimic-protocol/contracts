import { AbiCoder } from 'ethers'

export type DynamicArg = { kind: number; data: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function literal(types: string[], values: any[]): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['string', ...types], ['', ...values])
  return { kind: 0, data }
}

export function variable(opIndex: number, subIndex: number): DynamicArg {
  const data = AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [opIndex, subIndex])
  return { kind: 1, data }
}
