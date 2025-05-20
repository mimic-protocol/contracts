import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { Contract, hexlify, randomBytes } from 'ethers'

export type Account = string | HardhatEthersSigner | Contract

export function toAddress(x: Account): string {
  return typeof x === 'string' ? x : x.address || x.target
}

export function randomAddress(): string {
  return randomHex(20)
}

export function randomHex(length: number): string {
  return hexlify(randomBytes(length))
}
