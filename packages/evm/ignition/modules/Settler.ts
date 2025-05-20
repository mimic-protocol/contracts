import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

import ControllerModule from './Controller'

export default buildModule('Settler', (m) => {
  const admin = m.getParameter('admin')
  const { controller } = m.useModule(ControllerModule)
  const settler = m.contract('Settler', [controller, admin])
  return { settler }
})
