import {
  createMetadataAccountV3,
  findMetadataPda,
  updateMetadataAccountV2,
  type DataV2Args,
} from "@metaplex-foundation/mpl-token-metadata";
import type { Address, Instruction } from "@solana/kit";
import {
  getUmi,
  toKitInstructions,
  toUmiPublicKey,
  toUmiSigner,
} from "./metaplex-umi";

/** The fields this app writes to a token's metadata account. */
export type TokenMetadataFields = Pick<DataV2Args, "name" | "symbol" | "uri">;

const dataV2 = (fields: Partial<TokenMetadataFields>): DataV2Args => ({
  name: "",
  symbol: "",
  uri: "",
  sellerFeeBasisPoints: 0,
  creators: null,
  collection: null,
  uses: null,
  ...fields,
});

/**
 * Creates the Metaplex metadata account for `mint`. `wallet` must be the mint
 * authority; it pays for the account and becomes the update authority.
 */
export function createMetadataInstructions(
  wallet: Address,
  mint: Address,
  fields: Partial<TokenMetadataFields>,
): Instruction[] {
  const umi = getUmi();
  const mintKey = toUmiPublicKey(mint);
  return toKitInstructions(
    createMetadataAccountV3(umi, {
      mint: mintKey,
      metadata: findMetadataPda(umi, { mint: mintKey }),
      mintAuthority: toUmiSigner(wallet),
      updateAuthority: toUmiPublicKey(wallet),
      payer: toUmiSigner(wallet),
      data: dataV2(fields),
      isMutable: true,
      collectionDetails: null,
    }),
  );
}

/** Rewrites the metadata of `mint`. `wallet` must be the update authority. */
export function updateMetadataInstructions(
  wallet: Address,
  mint: Address,
  fields: Partial<TokenMetadataFields>,
): Instruction[] {
  const umi = getUmi();
  return toKitInstructions(
    updateMetadataAccountV2(umi, {
      metadata: findMetadataPda(umi, { mint: toUmiPublicKey(mint) }),
      updateAuthority: toUmiSigner(wallet),
      data: dataV2(fields),
      isMutable: true,
      primarySaleHappened: true,
    }),
  );
}
