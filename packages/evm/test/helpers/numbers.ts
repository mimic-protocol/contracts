const SCALING_FACTOR = BigInt(1e18)

export type BigNumberish = number | string | bigint

export const fp = (x: BigNumberish): bigint => {
  if (typeof x === 'bigint') return x * SCALING_FACTOR

  const value = typeof x === 'number' ? x.toString() : x
  const match = value.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error('Invalid format: must be a non-negative number with up to 18 decimals')

  const [, intPart, decimalPart = ''] = match
  if (decimalPart.length > 18) throw new Error('Too many decimal places, max allowed is 18')

  const paddedDecimals = (decimalPart + '0'.repeat(18)).slice(0, 18)
  const fullNumber = `${intPart}${paddedDecimals}`
  return BigInt(fullNumber)
}

export const bn = (x: BigNumberish): bigint => {
  if (typeof x === 'number') return BigInt(x)
  if (typeof x === 'string') return BigInt(x)
  return x
}
