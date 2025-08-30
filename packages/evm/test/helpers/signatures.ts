import { randomHex } from './addresses'

export type Signature = string

export function randomSig(): string {
  return randomHex(65)
}
