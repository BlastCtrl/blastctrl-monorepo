import { env as clientEnv } from "@/env/client";
import { env } from "@/env/server";
import cache from "@/lib/cache-manager";
import { buildJupiterSwapToSOL } from "@blastctrl/octane-core";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  isAddress,
} from "@solana/kit";
import { z } from "zod";

export const maxDuration = 60;
export const runtime = "nodejs";

/** Octane's fee payer, which signs the swap before the user does. */
const feePayer = await createKeyPairSignerFromBytes(
  getBase58Encoder().encode(env.OCTANE_SECRET_KEYPAIR),
);
const rpc = createSolanaRpc(clientEnv.NEXT_PUBLIC_RPC_ENDPOINT);

const body = z.object({
  user: z.string().refine(isAddress, "Not an address"),
  sourceMint: z.string().refine(isAddress, "Not an address"),
  /** In the mint's raw units, as a number or a string. */
  amount: z.coerce.bigint().positive(),
  /** How far the price may move before the swap fails, in basis points. */
  slippageBps: z.number().int().min(1).max(10_000),
});

export async function POST(req: Request) {
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) {
      throw Error(parsed.error.issues[0]?.message ?? "Invalid request body");
    }

    const { user, sourceMint, amount, slippageBps } = parsed.data;
    const { quote, transaction } = await buildJupiterSwapToSOL({
      rpc,
      feePayer,
      user: address(user),
      sourceMint: address(sourceMint),
      amount,
      slippageBps,
      cache,
      fees: { platformSolFeeBps: env.OCTANE_PLATFORM_FEE_BPS },
    });

    const { blockhash, lastValidBlockHeight } = transaction.lifetimeConstraint;
    return Response.json({
      status: "ok",
      transaction: getBase64EncodedWireTransaction(transaction),
      // What the sender needs to know when to give up waiting.
      lifetime: {
        blockhash,
        lastValidBlockHeight: String(lastValidBlockHeight),
      },
      quote,
    });
  } catch (err) {
    console.error(err);
    const error = err instanceof Error ? err.message : String(err);
    return Response.json({ error }, { status: 400 });
  }
}
