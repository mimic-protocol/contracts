import { AbiCoder } from 'ethers'

import { Account, toAddress } from './addresses'
import { NAry, toArray } from './arrays'

/* eslint-disable no-unused-vars */

export type Safeguard = {
  mode: number
  config: string
}

export enum SwapSafeguardMode {
  None,
  SourceChain,
  DestinationChain,
  TokenIn,
  TokenOut,
  Recipient,
}

export enum TransferSafeguardMode {
  None,
  Chain,
  Token,
  Recipient,
}

export enum CallSafeguardMode {
  None,
  Chain,
  Target,
  Method,
}

export function createSafeguard(mode: number, config = '0x'): Safeguard {
  return { mode, config }
}

export function createSafeguardNone(): Safeguard {
  return createSafeguard(0)
}

export function createOnlyAccountSafeguard(mode: number, account: NAry<Account>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'address[]'], [false, toArray(account).map(toAddress)])
  return createSafeguard(mode, config)
}

export function createOnlyChainSafeguard(mode: number, chain: NAry<number>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'uint256[]'], [false, toArray(chain)])
  return createSafeguard(mode, config)
}

export function createOnlyMethodSafeguard(method: NAry<string>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'bytes4[]'], [false, toArray(method)])
  return createSafeguard(CallSafeguardMode.Method, config)
}
