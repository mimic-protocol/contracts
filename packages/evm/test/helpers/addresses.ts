import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { Contract } from 'ethers'

export type Account = string | HardhatEthersSigner | Contract

export function toAddress(x: Account): string {
  return typeof x === 'string' ? x : x.address || x.target
}
