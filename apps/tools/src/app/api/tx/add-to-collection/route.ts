/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { chunk } from "@/lib/utils";
import { Networks } from "@/lib/solana/endpoints";
z;
import { addNftToCollection } from "@/lib/solana/collections";
import type { Cluster } from "@solana/web3.js";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNoopSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import type { Umi } from "@metaplex-foundation/umi";

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
  network: z.enum(["mainnet-beta", "devnet", "testnet"]),
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

  const authority = publicKey(authorityAddress);
  const umi = createUmi(Networks[network]).use(
    signerIdentity(createNoopSigner(authority)),
  );
  const collection = publicKey(collectionAddress);
  const nfts = nftMints.map((str) => publicKey(str));

  const batchSize = 6;
  const chunkedInstructions = chunk(
    nfts.map((nft) =>
      addNftToCollection(umi as Umi, authority, nft, collection),
    ),
    batchSize,
  );

  const { blockhash, lastValidBlockHeight } =
    await umi.rpc.getLatestBlockhash();
  const transactions = chunkedInstructions.map((batch) =>
    umi.transactions.create({
      version: 0,
      payer: authority,
      instructions: [...batch.flat()],
      blockhash,
    }),
  );
  const serializedTransactionsBase64 = transactions.map((tx) =>
    Buffer.from(umi.transactions.serialize(tx)).toString("base64"),
  );

  return Response.json({
    tx: serializedTransactionsBase64,
    blockhash,
    lastValidBlockHeight,
  });
}
