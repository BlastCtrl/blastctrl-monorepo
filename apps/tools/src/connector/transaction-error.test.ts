import {
  SolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
  SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { transactionErrorMessage } from "./transaction-error";

describe("transactionErrorMessage", () => {
  const programError = new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, {
    code: 12,
    index: 3,
  });

  it("reaches the program error through kit's two wrappers", () => {
    const estimate = new SolanaError(
      SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
      { cause: programError },
    );
    const send = new SolanaError(
      SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
      { cause: estimate, transactionPlanResult: {} as never },
    );
    expect(transactionErrorMessage(send)).toBe(programError.message);
    expect(transactionErrorMessage(send)).toMatch(/#12/);
  });

  it("keeps a single wrapper's inner message", () => {
    const wrapped = new SolanaError(
      SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
      { cause: programError },
    );
    expect(transactionErrorMessage(wrapped)).toBe(programError.message);
  });

  it("returns a bare error's own message and stringifies non-errors", () => {
    expect(transactionErrorMessage(programError)).toBe(programError.message);
    expect(transactionErrorMessage(Error("nope"))).toBe("nope");
    expect(transactionErrorMessage("plain")).toBe("plain");
  });

  it("stops at a cause that is not an Error", () => {
    const withString = new SolanaError(
      SOLANA_ERROR__TRANSACTION__FAILED_TO_ESTIMATE_COMPUTE_LIMIT,
      { cause: "text" as unknown as Error },
    );
    expect(transactionErrorMessage(withString)).toBe(withString.message);
  });
});
