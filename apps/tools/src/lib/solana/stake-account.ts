/** Size in bytes of a `StakeStateV2` account. */
export const STAKE_ACCOUNT_SIZE = 200;

/**
 * Minimum delegation under SIMD-0490 (Stake v5): 1 SOL. A new delegation
 * can't be smaller, and a split must leave at least this much of delegated
 * stake on both sides.
 */
export const MIN_DELEGATION_LAMPORTS = 1_000_000_000n;
