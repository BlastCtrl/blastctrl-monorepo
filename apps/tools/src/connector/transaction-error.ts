import { isSolanaError } from "@solana/kit";

/**
 * Human-readable message for a failed kit transaction.
 *
 * Kit wraps the program's error: a failed send carries the simulation
 * failure as its `cause`, which carries the program error as its own
 * `cause`. The innermost one is what the user needs to read.
 */
export const transactionErrorMessage = (error: unknown) => {
  let current = error;
  while (isSolanaError(current) && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
};
