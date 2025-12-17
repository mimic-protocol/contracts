import { expect } from 'chai'
import { FailedTransactionMetadata, TransactionMetadata } from 'litesvm'

/**
 * Helper to expect transaction errors consistently
 */
export function expectTransactionError(
  res: TransactionMetadata | FailedTransactionMetadata | string,
  expectedMessage: string
): void {
  expect(typeof res).to.not.be.eq('TransactionMetadata')

  if (typeof res === 'string') {
    expect(res).to.include(expectedMessage)
  } else {
    expect(res.toString()).to.include(expectedMessage)
  }
}
