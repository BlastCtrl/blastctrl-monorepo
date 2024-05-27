/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { chunk } from "@/lib/utils";
import { getMetadata } from "@/lib/solana";
import { unverifyCollectionNft } from "@/lib/solana/collections";
import { Networks } from "@/lib/solana/endpoints";
import { fetchMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  createNoopSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import type { Cluster } from "@solana/web3.js";
import type { Umi } from "@metaplex-foundation/umi";
import type { NextRequest } from "next/server";

export type TxUnverifyData = {
  tx: string[];
  blockhash: string;
  lastValidBlockHeight: number;
  minContextSlot: number;
};

export type Input = {
  authorityAddress: string;
  nftMints: string[];
  network: Cluster;
};

export async function POST(req: NextRequest) {
  const { authorityAddress, nftMints, network } = (await req.json()) as Input;

  const authority = publicKey(authorityAddress);
  const umi = createUmi(Networks[network]).use(
    signerIdentity(createNoopSigner(authority)),
  );
  const nfts = nftMints.map((str) => publicKey(str));

  if (!nfts[0]) {
    return new Response("Missing nft mints", {
      status: 400,
      statusText: "Bad Request",
    });
  }

  const nftMetadata = await fetchMetadata(umi, getMetadata(nfts[0]));

  const collection = (nftMetadata as any).collection?.value?.key;

  if (!collection) {
    return new Response("NFT missing collection key", {
      status: 400,
      statusText: "Bad Request",
    });
  }

  const batchSize = 12;
  const chunkedInstructions = chunk(
    nfts.map((nft) =>
      unverifyCollectionNft(umi as Umi, authority, nft, collection),
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
