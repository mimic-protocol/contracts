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
  Selector,
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

export function createDeniedAccountSafeguard(mode: number, account: NAry<Account>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'address[]'], [true, toArray(account).map(toAddress)])
  return createSafeguard(mode, config)
}

export function createOnlyChainSafeguard(mode: number, chain: NAry<number>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'uint256[]'], [false, toArray(chain)])
  return createSafeguard(mode, config)
}

export function createDeniedChainSafeguard(mode: number, chain: NAry<number>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'uint256[]'], [true, toArray(chain)])
  return createSafeguard(mode, config)
}

export function createOnlySelectorSafeguard(selector: NAry<string>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'bytes4[]'], [false, toArray(selector)])
  return createSafeguard(CallSafeguardMode.Selector, config)
}

export function createDeniedSelectorSafeguard(selector: NAry<string>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'bytes4[]'], [true, toArray(selector)])
  return createSafeguard(CallSafeguardMode.Selector, config)
}
