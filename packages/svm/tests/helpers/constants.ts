// Test constants for time values (in seconds)
export const COOLDOWN_PERIOD = 3600
export const COOLDOWN_PERIOD_PLUS_ONE = 3601
export const INTENT_DEADLINE_OFFSET = 3600
export const PROPOSAL_DEADLINE_OFFSET = 1800
export const STALE_CLAIM_DELAY = 50
export const STALE_CLAIM_DELAY_PLUS_ONE = 51
export const SHORT_DEADLINE = 100
export const MEDIUM_DEADLINE = 300
export const LONG_DEADLINE = 500
export const VERY_SHORT_DEADLINE = 10
export const WARP_TIME_SHORT = 100
export const WARP_TIME_MEDIUM = 300
export const WARP_TIME_LONG = 500
export const EXPIRATION_TEST_DELAY = 80
export const EXPIRATION_TEST_DELAY_PLUS_ONE = 81
export const DOUBLE_CLAIM_DELAY = 90
export const DOUBLE_CLAIM_DELAY_PLUS_ONE = 91

// Test constants for amounts
export const DEFAULT_MAX_FEE = 1000
export const DEFAULT_MAX_FEE_HALF = 500
export const DEFAULT_MAX_FEE_EXCEED = 1500
export const ACCOUNT_CLOSE_FEE = 5000 // Fee for closing accounts

// Test constants for data
export const DEFAULT_DATA_HEX = '010203'
export const DEFAULT_TOPIC_HEX = Buffer.from(Array(32).fill(1)).toString('hex')
export const DEFAULT_EVENT_DATA_HEX = '040506'
export const EMPTY_DATA_HEX = ''
export const TEST_DATA_HEX_1 = '070809'
export const TEST_DATA_HEX_2 = '0a0b0c'
export const TEST_DATA_HEX_3 = 'deadbeef'

// Test constants for validation
export const DEFAULT_MIN_VALIDATIONS = 1
export const MULTIPLE_MIN_VALIDATIONS = 3

// Test constants for iterations
export const LARGE_EXTEND_ITERATIONS = 100
export const MULTIPLE_PROPOSALS_COUNT = 20

// Test constants for hex string lengths
export const INTENT_HASH_LENGTH = 32 // bytes
export const NONCE_LENGTH = 32 // bytes
export const SIGNATURE_LENGTH = 64 // bytes

// Test constants for cooldown validation
export const MAX_COOLDOWN = 3600 * 24 * 30 // 30 days
export const MAX_COOLDOWN_PLUS_ONE = MAX_COOLDOWN + 1
export const MIN_COOLDOWN = 0
