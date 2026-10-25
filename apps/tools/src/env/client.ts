import { createEnv } from "@t3-oss/env-core";
import { isAddress, type Address } from "@solana/kit";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_RPC_ENDPOINT: z.url(),
    // Optional. RPC used when the wallet is on devnet; falls back to the
    // public https://api.devnet.solana.com when unset.
    NEXT_PUBLIC_RPC_ENDPOINT_DEVNET: z.url().optional(),
    // Reclaim-rent tool: the wallet that receives the service fee and the
    // fee as a share of the reclaimed excess, in basis points (500 = 5%).
    // Leave both unset (or the rate at 0) for no fee.
    NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT: z
      .custom<Address>(
        (value) => typeof value === "string" && isAddress(value),
        "must be a Solana address",
      )
      .optional(),
    NEXT_PUBLIC_RECLAIM_RENT_FEE_BPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_RPC_ENDPOINT: process.env.NEXT_PUBLIC_RPC_ENDPOINT,
    NEXT_PUBLIC_RPC_ENDPOINT_DEVNET:
      process.env.NEXT_PUBLIC_RPC_ENDPOINT_DEVNET,
    NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT:
      process.env.NEXT_PUBLIC_RECLAIM_RENT_FEE_RECIPIENT,
    NEXT_PUBLIC_RECLAIM_RENT_FEE_BPS:
      process.env.NEXT_PUBLIC_RECLAIM_RENT_FEE_BPS,
  },
});
