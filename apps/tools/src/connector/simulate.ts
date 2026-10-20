import {
  compileTransaction,
  getBase64EncodedWireTransaction,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
} from "@solana/kit";
import type { KitClient } from "./use-kit-client";

/**
 * Simulates `instructions` as one transaction without asking the wallet to
 * sign: the planner sets the fee payer, a lifetime is added so the message
 * compiles, and the RPC skips signature verification. Returns the RPC's
 * simulation value (`err`, `logs`, `unitsConsumed`, …).
 */
export async function simulateUnsigned(
  client: KitClient,
  instructions: Instruction[],
) {
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();
  const message = setTransactionMessageLifetimeUsingBlockhash(
    latestBlockhash,
    await client.planTransaction(instructions),
  );
  const { value } = await client.rpc
    .simulateTransaction(
      getBase64EncodedWireTransaction(compileTransaction(message)),
      { encoding: "base64", sigVerify: false, commitment: "confirmed" },
    )
    .send();
  return value;
}
