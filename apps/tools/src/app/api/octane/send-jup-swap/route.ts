import { env } from "@/env/server";
import { env as publicEnv } from "@/env/client";
import cache from "@/lib/cache-manager";
import {
  MESSAGE_TOKEN_KEY,
  signGeneratedTransaction,
} from "@blastctrl/octane-core";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import base58 from "bs58";
import { z } from "zod";
import { sendSignedTransaction } from "@/lib/solana/send";

const ENV_SECRET_KEYPAIR = Keypair.fromSecretKey(
  base58.decode(env.OCTANE_SECRET_KEYPAIR),
);

const validator = z.object({
  transaction: z.string(),
  messageToken: z.string(),
});

export async function POST(req: Request) {
  // await cors(request, response);
  // await rateLimit(request, response);
  try {
    const validatedBody = validator.safeParse(await req.json());

    if (validatedBody.success === false) {
      throw Error(
        validatedBody.error.errors[0]?.message ?? "Invalid request body",
      );
    }
    const connection = new Connection(publicEnv.NEXT_PUBLIC_RPC_ENDPOINT);
    const { transaction: serialized, messageToken } = validatedBody.data;

    // Deserialize a base58 wire-encoded transaction from the request

    let transaction: VersionedTransaction;
    try {
      transaction = VersionedTransaction.deserialize(base58.decode(serialized));
    } catch (e) {
      console.log(e);
      throw Error("can't decode transaction");
    }

    try {
      const { signature } = await signGeneratedTransaction(
        connection,
        transaction,
        ENV_SECRET_KEYPAIR,
        MESSAGE_TOKEN_KEY,
        messageToken,
        cache,
      );

      transaction.addSignature(
        ENV_SECRET_KEYPAIR.publicKey,
        Buffer.from(base58.decode(signature)),
      );

      const { context, value } =
        await connection.getLatestBlockhashAndContext();

      await sendSignedTransaction({
        connection,
        signedTransaction: transaction,
        slot: context.slot,
        blockhash: value.blockhash,
        lastValidBlockHeight: value.lastValidBlockHeight,
      });

      // Respond with the confirmed transaction signature
      return Response.json({ status: "ok", signature });
    } catch (error) {
      let message = "";
      console.log(error);
      if (error instanceof Error) {
        message = error.message;
      }
      return new Response(message, {
        status: 500,
        statusText: "Internal Server Error",
      });
    }
  } catch (err) {
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
