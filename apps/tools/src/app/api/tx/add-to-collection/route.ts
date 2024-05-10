import { chunk } from "@/lib/utils";
import { Networks } from "@/lib/solana/endpoints";
import { getMetadata } from "@/lib/solana";
import { addNftToCollection } from "@/lib/solana/collections";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import type { Cluster } from "@solana/web3.js";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { NextRequest } from "next/server";
import { z } from "zod";

export type TxSetAndVerifyData = {
  tx: string[];
  blockhash: string;
  lastValidBlockHeight: number;
  minContextSlot: number;
};

export type Input = {
  authorityAddress: string;
  collectionAddress: string;
  nftMints: string[];
  network: Cluster;
};

const schema = z.object({
  network: z.string(),
  authorityAddress: z.string(),
  collectionAddress: z.string(),
  nftMints: z.array(z.string()).min(1),
});

type InputBody = z.infer<typeof schema>;

export async function POST(req: NextRequest) {
  let params: InputBody;
  try {
    params = schema.parse(await req.json());
  } catch {
    return new Response("Invalid parameters", {
      status: 400,
      statusText: "Bad Request",
    });
  }

  const { authorityAddress, collectionAddress, nftMints, network } = params;

  // @ts-expect-error TODO: fix the zod schema
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const connection = new Connection(Networks[network]);
  const authority = new PublicKey(authorityAddress);
  const collection = new PublicKey(collectionAddress);
  const nfts = nftMints.map((str) => new PublicKey(str));
  const collectionMetadata = await Metadata.fromAccountAddress(
    connection,
    getMetadata(collection),
  );

  const batchSize = 12;
  const chunkedInstructions = chunk(
    nfts.map((nft) =>
      addNftToCollection(authority, nft, collection, collectionMetadata),
    ),
    batchSize,
  );

  const {
    context: { slot: minContextSlot },
    value: { blockhash, lastValidBlockHeight },
  } = await connection.getLatestBlockhashAndContext("finalized");
  const transactions = chunkedInstructions.map((batch) =>
    new Transaction({
      feePayer: authority,
      blockhash,
      lastValidBlockHeight,
    }).add(...batch.flat()),
  );

  const serializedTransactionsBase64 = transactions.map((tx) =>
    tx
      .serialize({
        requireAllSignatures: false,
        verifySignatures: true,
      })
      .toString("base64"),
  );

  return Response.json({
    tx: serializedTransactionsBase64,
    blockhash,
    lastValidBlockHeight,
    minContextSlot,
  });
}
