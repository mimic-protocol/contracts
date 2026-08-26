import { BigNumberish, SETTLER_EIP712_DOMAIN } from '@mimicprotocol/sdk'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { AbiCoder, Contract, TypedDataEncoder } from 'ethers'
import { network } from 'hardhat'

import { Account, toAddress } from './addresses'
import { NAry, toArray } from './arrays'

/* eslint-disable no-unused-vars */

export const USER_SAFEGUARD_712_TYPE = {
  UserSafeguard: [
    { name: 'user', type: 'address' },
    { name: 'safeguard', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
}

export enum SafeguardConfigMode {
  List,
  Tree,
}

export type Safeguard = {
  mode: number
  config: string
}

export type SafeguardGroup = {
  logic: number
  leaves: number[]
  children: number[]
}

export enum SafeguardGroupLogic {
  AND,
  OR,
  XOR,
  NOT,
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

export function createSafeguardNone(): Safeguard {
  return { mode: 0, config: '0x' }
}

export function createOnlyAccountSafeguard(mode: number, account: NAry<Account>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'address[]'], [false, toArray(account).map(toAddress)])
  return { mode, config }
}

export function createDeniedAccountSafeguard(mode: number, account: NAry<Account>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'address[]'], [true, toArray(account).map(toAddress)])
  return { mode, config }
}

export function createOnlyChainSafeguard(mode: number, chain: NAry<number>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'uint256[]'], [false, toArray(chain)])
  return { mode, config }
}

export function createDeniedChainSafeguard(mode: number, chain: NAry<number>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'uint256[]'], [true, toArray(chain)])
  return { mode, config }
}

export function createOnlySelectorSafeguard(selector: NAry<string>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'bytes4[]'], [false, toArray(selector)])
  return { mode: CallSafeguardMode.Selector, config }
}

export function createDeniedSelectorSafeguard(selector: NAry<string>): Safeguard {
  const config = AbiCoder.defaultAbiCoder().encode(['bool', 'bytes4[]'], [true, toArray(selector)])
  return { mode: CallSafeguardMode.Selector, config }
}

export function createListSafeguard(safeguard: NAry<Safeguard>): string {
  const coder = AbiCoder.defaultAbiCoder()
  const payload = coder.encode(['tuple(uint8,bytes)[]'], [toArray(safeguard).map(({ mode, config }) => [mode, config])])
  return coder.encode(['uint8', 'bytes'], [SafeguardConfigMode.List, payload])
}

export function createTreeSafeguard(groups: SafeguardGroup[], leaves: Safeguard[]): string {
  const coder = AbiCoder.defaultAbiCoder()
  const encodedGroups = groups.map((g) => [g.logic, g.leaves, g.children])
  const encodedLeaves = leaves.map((l) => [l.mode, l.config])
  const payload = coder.encode(
    ['tuple(uint8,uint16[],uint16[])[]', 'tuple(uint8,bytes)[]'],
    [encodedGroups, encodedLeaves]
  )
  return coder.encode(['uint8', 'bytes'], [SafeguardConfigMode.Tree, payload])
}

export async function hashUserSafeguard(
  settler: Contract,
  user: Account,
  safeguard: string,
  nonce: BigNumberish,
  deadline: BigNumberish
): Promise<string> {
  const connection = await network.connect()
  const chainId = connection.networkConfig.chainId
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId, verifyingContract: settler.target }
  return TypedDataEncoder.hash(domain, USER_SAFEGUARD_712_TYPE, { user: toAddress(user), safeguard, nonce, deadline })
}

export async function signUserSafeguard(
  settler: Contract,
  user: Account,
  safeguard: string,
  nonce: BigNumberish,
  deadline: BigNumberish,
  signer: HardhatEthersSigner
): Promise<string> {
  const connection = await network.connect()
  const chainId = connection.networkConfig.chainId
  const domain = { ...SETTLER_EIP712_DOMAIN, chainId, verifyingContract: settler.target }
  return signer.signTypedData(domain, USER_SAFEGUARD_712_TYPE, { user: toAddress(user), safeguard, nonce, deadline })
}
