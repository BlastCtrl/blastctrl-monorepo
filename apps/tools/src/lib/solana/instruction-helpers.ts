import type { PublicKey } from "@solana/web3.js";
import type { DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata";
import { getMetadata } from "./common";

export const createMetadataInstruction = (
  wallet: PublicKey,
  mint: PublicKey,
  dataV2: Partial<DataV2>,
) => {
  const metadata = getMetadata(mint);
  const mintAuthority = wallet;
  const updateAuthority = wallet;
  const payer = wallet;
  const dummy: DataV2 = {
    name: "",
    symbol: "",
    uri: "",
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  };
  const data = { ...dummy, ...dataV2 };
  return createCreateMetadataAccountV3Instruction(
    {
      mint,
      metadata,
      mintAuthority,
      updateAuthority,
      payer,
    },
    {
      createMetadataAccountArgsV3: {
        data,
        isMutable: true,
        collectionDetails: null,
      },
    },
  );
};

export const updateMetadataInstruction = (
  wallet: PublicKey,
  mint: PublicKey,
  dataV2: Partial<DataV2>,
) => {
  const metadata = getMetadata(mint);
  const updateAuthority = wallet;
  const dummy: DataV2 = {
    name: "",
    symbol: "",
    uri: "",
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  };
  const data = { ...dummy, ...dataV2 };
  return createUpdateMetadataAccountV2Instruction(
    {
      metadata,
      updateAuthority,
    },
    {
      updateMetadataAccountArgsV2: {
        data,
        isMutable: true,
        updateAuthority,
        primarySaleHappened: true,
      },
    },
  );
};
