import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('Controller', (m) => {
  const admin = m.getParameter('admin')
  const solvers = m.getParameter('solvers')
  const executors = m.getParameter('executors')
  const proposalSigners = m.getParameter('proposalSigners')
  const controller = m.contract('Controller', [admin, solvers, executors, proposalSigners])
  return { controller }
})
