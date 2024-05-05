import { env } from "@/env/server";
import { env as publicEnv } from "@/env/client";
import cache from "@/lib/cache-manager";
import {
  MESSAGE_TOKEN_KEY,
  signGeneratedTransaction,
} from "@blastctrl/octane-core";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import base58 from "bs58";
import { z } from "zod";
import {
  createKeyPairSignerFromBytes,
  createRpc,
  createSolanaRpc,
  mainnet,
} from "@solana/web3.js-experimental";
import { fromVersionedTransaction } from "./_util";

const ENV_SECRET_SIGNER = await createKeyPairSignerFromBytes(
  base58.decode(env.OCTANE_SECRET_KEYPAIR),
);

// const ENV_SECRET_KEYPAIR = Keypair.fromSecretKey(
//   base58.decode(env.OCTANE_SECRET_KEYPAIR),
// );

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
    const connection = new Connection(process.env.NEXT_PUBLIC_RPC_ENDPOINT!);
    const { transaction: serialized, messageToken } = validatedBody.data;

    // Deserialize a base58 wire-encoded transaction from the request

    let legacyTransaction: VersionedTransaction;
    try {
      legacyTransaction = VersionedTransaction.deserialize(
        base58.decode(serialized),
      );
    } catch (e) {
      console.log(e);
      throw Error("can't decode transaction");
    }

    const transaction = fromVersionedTransaction(legacyTransaction);
    const rpc = createSolanaRpc(mainnet(publicEnv.NEXT_PUBLIC_RPC_ENDPOINT));

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

      // rpc.sendTransaction()

      const rawTransaction = transaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });
      const latestBlockHash = await connection.getLatestBlockhash();

      await connection.confirmTransaction({
        signature: txid,
        ...latestBlockHash,
      });

      // Respond with the confirmed transaction signature
      return Response.json({ status: "ok", signature });
    } catch (error) {
      let message = "";
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
