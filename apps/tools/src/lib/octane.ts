import type { JupiterQuote } from "@blastctrl/octane-core";
import {
  getBase64Encoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
  type Transaction,
  type TransactionWithBlockhashLifetime,
} from "@solana/kit";

export type { JupiterQuote };

type SwapResponse = {
  status: "ok";
  /** Base64 wire encoding, signed by the fee payer. */
  transaction: string;
  lifetime: { blockhash: string; lastValidBlockHeight: string };
  quote: JupiterQuote;
};

/** The fee payer has signed; the user's signature is still missing. */
export type SwapTransaction = Transaction & TransactionWithBlockhashLifetime;

/**
 * Asks the Octane backend for a swap of `amount` (in the mint's raw units)
 * of `sourceMint` to SOL for `user`, paid for and already signed by Octane's
 * fee payer. The user signs it next and sends it themselves.
 */
export async function buildSwapToSol(
  user: Address,
  sourceMint: string,
  amount: number,
): Promise<{ transaction: SwapTransaction; quote: JupiterQuote }> {
  const response = await fetch("/api/octane/build-jup-swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, sourceMint, amount }),
  });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw Error(error ?? `${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as SwapResponse;
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(data.transaction),
  );
  return {
    transaction: {
      ...transaction,
      lifetimeConstraint: {
        blockhash: data.lifetime.blockhash as Blockhash,
        lastValidBlockHeight: BigInt(data.lifetime.lastValidBlockHeight),
      },
    },
    quote: data.quote,
  };
}
