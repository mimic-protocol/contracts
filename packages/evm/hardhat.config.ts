import hardhatToolboxMochaEthersPlugin from '@nomicfoundation/hardhat-toolbox-mocha-ethers'
import hardhatVerify from '@nomicfoundation/hardhat-verify'
import dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'

dotenv.config()

const config: HardhatUserConfig = {
  plugins: [hardhatVerify, hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    },
  },
  networks: {
    optimism: {
      type: 'http',
      chainId: 10,
      url: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    base: {
      type: 'http',
      chainId: 8453,
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    arbitrum: {
      type: 'http',
      chainId: 42161,
      url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    gnosis: {
      type: 'http',
      chainId: 100,
      url: process.env.GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_KEY || '',
    },
  },
}

export default config
