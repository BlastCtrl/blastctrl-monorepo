import type { PublicKey } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";
import base58 from "bs58";

export type TokenFee = {
  mint: string;
  account: string;
  decimals: number;
  fee: number;
  burnFeeBp?: number;
  transferFeeBp?: number;
};

type WhirlpoolsQuote = {
  estimatedAmountIn: string;
  estimatedAmountOut: string;
  estimatedEndTickIndex: number;
  estimatedEndSqrtPrice: string;
  estimatedFeeAmount: string;
  amount: string;
  amountSpecifiedIsInput: boolean;
  aToB: boolean;
  otherAmountThreshold: string;
  sqrtPriceLimit: string;
  tickArray0: string;
  tickArray1: string;
  tickArray2: string;
};

export interface BuildWhirlpoolsSwapResponse {
  status: "ok";
  transaction: string;
  quote: WhirlpoolsQuote;
  messageToken: string;
}

// const OCTANE_ENDPOINT = "https://octane-server-seven.vercel.app/api";
const OCTANE_ENDPOINT = "/api/octane";

export async function buildWhirlpoolsSwapTransaction(
  user: PublicKey,
  sourceMint: string,
  amount: number,
  slippageTolerance = 0.5,
): Promise<{
  transaction: VersionedTransaction;
  quote: WhirlpoolsQuote;
  messageToken: string;
}> {
  const response = await fetch(OCTANE_ENDPOINT + "/build-jup-swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: user.toBase58(),
      sourceMint: sourceMint,
      amount: amount,
      slippageTolerance,
    }),
  })
    .then((res) => res.json())
    .then((data) => data as BuildWhirlpoolsSwapResponse);

  return {
    transaction: VersionedTransaction.deserialize(
      base58.decode(response.transaction),
    ),
    quote: response.quote,
    messageToken: response.messageToken,
  };
}

export async function sendWhirlpoolsSwapTransaction(
  transaction: VersionedTransaction,
  messageToken: string,
): Promise<string> {
  const res = await fetch(OCTANE_ENDPOINT + "/send-jup-swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction: base58.encode(transaction.serialize()),
      messageToken,
    }),
  });
  const data = await res.json();
  return data.signature as string;
}
