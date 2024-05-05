import { chunk } from "@/lib/utils";
import { Networks } from "@/lib/solana/endpoints";
import { getMetadata } from "@/lib/solana";
import { addNftToCollection } from "@/lib/solana/collections";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import type { Cluster } from "@solana/web3.js";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { NextApiRequest, NextApiResponse } from "next";

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

export async function POST(
  req: NextApiRequest,
  res: NextApiResponse<TxSetAndVerifyData>,
) {
  if (req.method === "POST") {
    const { authorityAddress, collectionAddress, nftMints, network } =
      req.body as Input;

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

    res.status(200).json({
      tx: serializedTransactionsBase64,
      blockhash,
      lastValidBlockHeight,
      minContextSlot,
    });
  } else {
    res.status(405).end();
  }
}
