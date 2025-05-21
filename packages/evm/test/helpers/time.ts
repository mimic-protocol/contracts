import { Block } from 'ethers'
import { network } from 'hardhat'

const { ethers } = await network.connect()

export async function currentBlock(): Promise<Block> {
  const block = ethers.provider.getBlock('latest')
  if (!block) throw Error('Could not find latest block')
  return block
}

export async function currentTimestamp(): Promise<bigint> {
  const block = await currentBlock()
  return BigInt(block.timestamp)
}
