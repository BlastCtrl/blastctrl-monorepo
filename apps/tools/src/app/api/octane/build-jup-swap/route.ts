import { env } from "@/env/server";
import cache from "@/lib/cache-manager";
import { buildJupiterSwapToSOL } from "@blastctrl/octane-core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import base58 from "bs58";
import { z } from "zod";

const ENV_SECRET_KEYPAIR = Keypair.fromSecretKey(
  base58.decode(env.OCTANE_SECRET_KEYPAIR),
);

const validator = z.object({
  user: z.string(),
  sourceMint: z.string(),
  amount: z.number(),
  slippageTolerance: z.number(),
});

export async function POST(req: Request) {
  try {
    const validatedBody = validator.safeParse(await req.json());

    if (validatedBody.success === false) {
      throw Error(
        validatedBody.error.errors[0]?.message ?? "Invalid request body",
      );
    }
    const connection = new Connection(process.env.NEXT_PUBLIC_RPC_ENDPOINT!);

    const { user, sourceMint, amount } = validatedBody.data;
    // Check for TokenFee
    const { quote, transaction } = await buildJupiterSwapToSOL(
      connection,
      ENV_SECRET_KEYPAIR,
      new PublicKey(user),
      new PublicKey(sourceMint),
      new BN(amount),
      cache,
      {
        bonkBurnFeeBps: env.BONK_BURN_FEE_BPS,
        platformSolFeeBps: env.OCTANE_PLATFORM_FEE_BPS,
      },
    );

    return Response.json({
      status: "ok",
      transaction: base58.encode(transaction.serialize()),
      quote,
    });
  } catch (err) {
    console.error(err);
    if (err instanceof Error) {
      console.error(err.message);
      return new Response(err.message, {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    return Response.error();
  }
}
