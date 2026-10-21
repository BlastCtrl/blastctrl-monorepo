import {
  compileTransaction,
  getBase64EncodedWireTransaction,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
} from "@solana/kit";
import type { KitClient } from "./use-kit-client";

/** The runtime's per-transaction maximum; kit's `MAX_COMPUTE_UNIT_LIMIT` is not exported. */
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

/**
 * Simulates `instructions` as one transaction without asking the wallet to
 * sign: the planner sets the fee payer, a lifetime is added so the message
 * compiles, and the RPC skips signature verification. Returns the RPC's
 * simulation value (`err`, `logs`, `unitsConsumed`, …).
 *
 * The planner leaves a provisory compute-unit limit of 0 in the message for
 * kit's estimator to replace; simulated as is, every transaction fails with
 * ComputationalBudgetExceeded, so the limit is raised to the maximum here,
 * as the estimator does.
 */
/**
 * What a failed simulation says to the user: the program's last log line,
 * which is where Token Metadata and the system program state their reason,
 * or the error itself when nothing was logged. `err` holds bigints, which
 * `JSON.stringify` refuses on its own.
 */
export function simulationFailureMessage(simulation: {
  err: unknown;
  logs: readonly string[] | null;
}): string {
  const prefix = "Program log: ";
  const log = simulation.logs?.filter((l) => l.startsWith(prefix)).at(-1);
  if (log) return log.slice(prefix.length);
  return JSON.stringify(simulation.err, (_, v) =>
    typeof v === "bigint" ? Number(v) : v,
  );
}

export async function simulateUnsigned(
  client: KitClient,
  instructions: Instruction[],
) {
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();
  const message = setTransactionMessageComputeUnitLimit(
    MAX_COMPUTE_UNIT_LIMIT,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      await client.planTransaction(instructions),
    ),
  );
  const { value } = await client.rpc
    .simulateTransaction(
      getBase64EncodedWireTransaction(compileTransaction(message)),
      { encoding: "base64", sigVerify: false, commitment: "confirmed" },
    )
    .send();
  return value;
}
