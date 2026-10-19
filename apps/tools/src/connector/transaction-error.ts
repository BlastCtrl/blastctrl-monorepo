import { isSolanaError } from "@solana/kit";

/** Human-readable message for a failed kit transaction. */
export const transactionErrorMessage = (error: unknown) => {
  if (isSolanaError(error)) {
    // Program errors (e.g. insufficient funds) are wrapped; surface the inner one.
    const cause = error.cause;
    return cause instanceof Error ? cause.message : error.message;
  }
  return error instanceof Error ? error.message : String(error);
};
