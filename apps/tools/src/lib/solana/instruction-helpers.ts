/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import type { DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import {
  createMetadataAccountV3,
  updateMetadataAccountV2,
} from "@metaplex-foundation/mpl-token-metadata";
import { getMetadata } from "./common";
import type { PublicKey, Umi } from "@metaplex-foundation/umi";
import { createNoopSigner } from "@metaplex-foundation/umi";

export const createMetadataInstruction = (
  umi: Umi,
  wallet: PublicKey,
  mint: PublicKey,
  dataV2: Partial<DataV2>,
) => {
  const metadata = getMetadata(mint);
  const mintAuthority = createNoopSigner(wallet);
  const updateAuthority = wallet;
  const payer = createNoopSigner(wallet);
  const dummy: DataV2 = {
    name: "",
    symbol: "",
    uri: "",
    sellerFeeBasisPoints: 0,
    creators: {
      __option: "None",
    },
    collection: {
      __option: "None",
    },
    uses: {
      __option: "None",
    },
  };
  const data = { ...dummy, ...dataV2 };
  return createMetadataAccountV3(umi, {
    mint,
    metadata,
    mintAuthority,
    updateAuthority,
    payer,
    data,
    isMutable: true,
    collectionDetails: null,
  });
};

export const updateMetadataInstruction = (
  umi: Umi,
  wallet: PublicKey,
  mint: PublicKey,
  dataV2: Partial<DataV2>,
) => {
  const metadata = getMetadata(mint);
  const updateAuthority = createNoopSigner(wallet);
  const dummy: DataV2 = {
    name: "",
    symbol: "",
    uri: "",
    sellerFeeBasisPoints: 0,
    creators: {
      __option: "None",
    },
    collection: {
      __option: "None",
    },
    uses: {
      __option: "None",
    },
  };
  const data = { ...dummy, ...dataV2 };
  return updateMetadataAccountV2(umi, {
    metadata,
    updateAuthority,
    data,
    isMutable: true,
    primarySaleHappened: true,
  });
};
