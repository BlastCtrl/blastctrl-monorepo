import { getMetadata } from "@/lib/solana";
import { unverifyCollectionNft } from "@/lib/solana/collections";
import { Networks } from "@/lib/solana/endpoints";
import { chunk } from "@/lib/utils";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import type { Cluster } from "@solana/web3.js";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { NextApiRequest, NextApiResponse } from "next";

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

export async function POST(
  req: NextApiRequest,
  res: NextApiResponse<TxUnverifyData>,
) {
  if (req.method === "POST") {
    const { authorityAddress, nftMints, network } = req.body as Input;

    const connection = new Connection(Networks[network]);
    const authority = new PublicKey(authorityAddress);
    const nfts = nftMints.map((str) => new PublicKey(str));
    if (!nfts[0]) {
      return res.status(400).end();
    }
    const nftMetadata = await Metadata.fromAccountAddress(
      connection,
      getMetadata(nfts[0]),
    );
    const collection = nftMetadata.collection?.key;
    if (!collection) {
      return res.status(400).end();
    }
    const collectionMetadata = await Metadata.fromAccountAddress(
      connection,
      getMetadata(collection),
    );

    const batchSize = 12;
    const chunkedInstructions = chunk(
      nfts.map((nft) =>
        unverifyCollectionNft(nft, authority, collection, collectionMetadata),
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

    // for (const tx of transactions) {
    //   const result = await connection.simulateTransaction(tx, []);
    // }

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
