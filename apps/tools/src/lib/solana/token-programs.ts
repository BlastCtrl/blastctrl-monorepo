import { address } from "@solana/kit";

/**
 * Token-2022 program. `@solana-program/token-2022` is not installed (it peers
 * on `@solana/zk-sdk`); the token client's instruction builders accept this
 * address via `programAddress`, which covers what the app needs so far.
 */
export const TOKEN_2022_PROGRAM_ADDRESS = address(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
