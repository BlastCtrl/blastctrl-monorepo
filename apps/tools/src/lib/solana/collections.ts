/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  unverifyCollectionV1,
  updateV1,
  verifyCollectionV1,
} from "@metaplex-foundation/mpl-token-metadata";
import { getMasterEdition, getMetadata } from "./common";
import type { Instruction, PublicKey, Umi } from "@metaplex-foundation/umi";
import { createNoopSigner } from "@metaplex-foundation/umi";

export const unverifyCollectionNft = (
  umi: Umi,
  wallet: PublicKey,
  nftMint: PublicKey,
  collectionMint: PublicKey,
): Instruction[] => {
  const metadata = getMetadata(nftMint);
  const collection = getMetadata(collectionMint);

  return unverifyCollectionV1(umi, {
    authority: createNoopSigner(wallet),
    collectionMint,
    collectionMetadata: collection,
    metadata,
  }).getInstructions();
};

export const addNftToCollection = (
  umi: Umi,
  wallet: PublicKey,
  nftMint: PublicKey,
  collectionMint: PublicKey,
): Instruction[] => {
  const metadata = getMetadata(nftMint);
  const collection = getMetadata(collectionMint);
  const collectionMasterEditionAccount = getMasterEdition(collectionMint);
  const instructions = updateV1(umi, {
    mint: nftMint,
    collection: {
      __kind: "Set",
      fields: [
        {
          verified: false,
          key: collectionMint,
        },
      ],
    },
  }).getInstructions();

  instructions.push(
    ...verifyCollectionV1(umi, {
      authority: createNoopSigner(wallet),
      collectionMint,
      collectionMetadata: collection,
      collectionMasterEdition: collectionMasterEditionAccount,
      metadata,
    }).getInstructions(),
  );

  return instructions as Instruction[];
};
