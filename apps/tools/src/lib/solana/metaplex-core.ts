import { createV1 } from "@metaplex-foundation/mpl-core";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { getUmi, toKitInstructions, toUmiSigner } from "./metaplex-umi";

export type CreateCoreAssetFields = {
  name: string;
  uri: string;
};

/**
 * Creates a Metaplex Core asset owned by `wallet`, which pays for it and is
 * its update authority (the program's defaults when neither is given).
 * `asset` is a fresh keypair signer; it is attached to the instruction so the
 * kit client signs with it.
 */
export function createCoreAssetInstructions(
  wallet: Address,
  asset: TransactionSigner,
  fields: CreateCoreAssetFields,
): Instruction[] {
  return toKitInstructions(
    createV1(getUmi(), {
      asset: toUmiSigner(asset.address),
      payer: toUmiSigner(wallet),
      name: fields.name,
      uri: fields.uri,
    }),
    [asset],
  );
}
