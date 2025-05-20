export const currentBlock = async (): Promise<{ number: number; timestamp: number }> => {
  const { network } = await import('hardhat')
  const { ethers } = await network.connect()
  return ethers.provider.send('eth_getBlockByNumber', ['latest', true])
}

export const currentTimestamp = async (): Promise<bigint> => {
  const block = await currentBlock()
  // TODO: fix 1 hour offset
  return BigInt(block.timestamp) + BigInt(60 * 60)
}
