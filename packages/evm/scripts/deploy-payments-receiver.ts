import { network } from 'hardhat'

import PaymentsReceiverArtifact from '../artifacts/contracts/payments/PaymentsReceiver.sol/PaymentsReceiver.json'
import { deployCreate3 } from './deploy-create3'

/* eslint-disable no-secrets/no-secrets */

const USDC: Record<string, string> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
}

async function main(): Promise<void> {
  const { networkName } = await network.connect()
  const usdc = USDC[networkName]
  if (!usdc) throw Error(`USDC address not defined for chain ${networkName}`)
  if (!process.env.ADMIN) throw Error('ADMIN env variable not provided')

  const args = [process.env.ADMIN, [usdc]]
  await deployCreate3(PaymentsReceiverArtifact, args, '0x02')
}

main().catch(console.error)
