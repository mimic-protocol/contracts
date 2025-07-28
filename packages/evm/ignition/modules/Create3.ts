import { buildModule, IgnitionModule } from '@nomicfoundation/hardhat-ignition/modules'

// eslint-disable-next-line no-secrets/no-secrets
const CREATEX_ADDRESS = '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed'

export default (contractName: string): IgnitionModule =>
  buildModule(`Create3${contractName}`, (m) => {
    const salt = m.getParameter('salt')
    const initCode = m.getParameter('initCode')

    const createX = m.contractAt('ICreateX', CREATEX_ADDRESS)
    const tx = m.call(createX, 'deployCreate3', [salt, initCode])
    const address = m.readEventArgument(tx, 'ContractCreation', 'newContract', { emitter: createX })

    const deployedContract = m.contractAt(contractName, address)
    return { [contractName]: deployedContract }
  })
