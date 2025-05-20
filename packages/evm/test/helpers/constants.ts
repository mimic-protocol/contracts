import { bn } from './numbers'

export const maxUint = (e: number): bigint => BigInt(bn(2) ** bn(e)) - bn(1)

export const MAX_UINT256: BigInt = maxUint(256)

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const ONES_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'
export const ONES_BYTES32 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
