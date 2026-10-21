// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/digitalAsset.ts (Apache-2.0).
/**
 * Fetch and decode a digital asset: its mint, metadata and, when present,
 * edition, combined into one object.
 */
import {
  assertAccountExists,
  decodeAccount,
  fetchEncodedAccounts,
  type Address,
  type EncodedAccount,
  type FetchAccountConfig,
  type FetchAccountsConfig,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import { getMintDecoder, type Mint } from "@solana-program/token";

import { decodeEdition, type Edition } from "../generated/accounts/edition";
import {
  decodeMasterEdition,
  type MasterEdition,
} from "../generated/accounts/masterEdition";
import {
  decodeMetadata,
  fetchMetadata,
  type Metadata,
} from "../generated/accounts/metadata";
import { findMasterEditionPda, findMetadataPda } from "../generated/pdas";
import { getKeyDecoder, Key } from "../generated/types/key";

/** A digital asset combines mint, metadata, and optional edition data. */
export type DigitalAsset<TMint extends string = string> = {
  /** The mint address (serves as the primary identifier). */
  address: Address<TMint>;
  /** The mint account data. */
  mint: Mint;
  /** The metadata account data. */
  metadata: Metadata;
  /** The edition account data (if present). */
  edition?:
    ({ isOriginal: true } & MasterEdition) | ({ isOriginal: false } & Edition);
};

/**
 * Fetches a digital asset by its mint address: the mint, metadata and
 * edition accounts in one RPC call.
 *
 * @example
 * ```ts
 * const digitalAsset = await fetchDigitalAsset(rpc, mintAddress);
 * console.log(digitalAsset.metadata.name);
 * ```
 */
export async function fetchDigitalAsset<TMint extends string = string>(
  rpc: Rpc<GetMultipleAccountsApi>,
  mint: Address<TMint>,
  config?: FetchAccountConfig,
): Promise<DigitalAsset<TMint>> {
  const [metadataAddress] = await findMetadataPda({ mint });
  const [editionAddress] = await findMasterEditionPda({ mint });

  const [mintAccount, metadataAccount, editionAccount] =
    await fetchEncodedAccounts(
      rpc,
      [mint, metadataAddress, editionAddress],
      config,
    );

  if (!mintAccount || !metadataAccount || !editionAccount) {
    throw new Error("Expected three accounts from getMultipleAccounts");
  }
  assertAccountExists(mintAccount);
  assertAccountExists(metadataAccount);

  return deserializeDigitalAsset(
    mint,
    mintAccount,
    metadataAccount,
    editionAccount.exists ? editionAccount : undefined,
  );
}

/**
 * Fetches a digital asset by its metadata address, for when you have the
 * metadata PDA but not the mint.
 */
export async function fetchDigitalAssetByMetadata(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  metadataAddress: Address,
  config?: FetchAccountConfig,
): Promise<DigitalAsset> {
  const metadata = await fetchMetadata(rpc, metadataAddress, config);
  return fetchDigitalAsset(rpc, metadata.data.mint, config);
}

/**
 * Fetches several digital assets by mint address in one RPC call. Assets
 * whose mint or metadata is missing, or that fail to decode, are skipped.
 *
 * @example
 * ```ts
 * const assets = await fetchAllDigitalAsset(rpc, [mint1, mint2, mint3]);
 * assets.forEach((asset) => console.log(asset.metadata.name));
 * ```
 */
export async function fetchAllDigitalAsset(
  rpc: Rpc<GetMultipleAccountsApi>,
  mints: Address[],
  config?: FetchAccountsConfig,
): Promise<DigitalAsset[]> {
  if (mints.length === 0) {
    return [];
  }

  // [mint1, metadata1, edition1, mint2, metadata2, edition2, ...]
  const accountsToFetch: Address[] = [];
  for (const mint of mints) {
    const [metadataAddress] = await findMetadataPda({ mint });
    const [editionAddress] = await findMasterEditionPda({ mint });
    accountsToFetch.push(mint, metadataAddress, editionAddress);
  }

  const allAccounts = await fetchEncodedAccounts(rpc, accountsToFetch, config);

  // Process accounts in groups of 3 (mint, metadata, edition).
  const digitalAssets: DigitalAsset[] = [];
  mints.forEach((mint, i) => {
    const mintAccount = allAccounts[i * 3];
    const metadataAccount = allAccounts[i * 3 + 1];
    const editionAccount = allAccounts[i * 3 + 2];

    if (!mintAccount?.exists || !metadataAccount?.exists) {
      return;
    }

    try {
      digitalAssets.push(
        deserializeDigitalAsset(
          mint,
          mintAccount,
          metadataAccount,
          editionAccount?.exists ? editionAccount : undefined,
        ),
      );
    } catch {
      // Skip assets that fail to deserialize.
    }
  });

  return digitalAssets;
}

/**
 * Decodes a digital asset from its encoded mint, metadata and (optional)
 * edition accounts.
 */
export function deserializeDigitalAsset<TMint extends string = string>(
  mintAddress: Address<TMint>,
  mintAccount: EncodedAccount,
  metadataAccount: EncodedAccount,
  editionAccount?: EncodedAccount,
): DigitalAsset<TMint> {
  const mint = decodeAccount(mintAccount, getMintDecoder());
  const metadata = decodeMetadata(metadataAccount).data;

  const digitalAsset: DigitalAsset<TMint> = {
    address: mintAddress,
    mint: mint.data,
    metadata,
  };

  if (!editionAccount) {
    return digitalAsset;
  }

  // The first byte of an edition account is its key.
  const editionKey = getKeyDecoder().decode(editionAccount.data);

  let edition: DigitalAsset<TMint>["edition"];
  if (
    editionKey === Key.MasterEditionV1 ||
    editionKey === Key.MasterEditionV2
  ) {
    edition = { isOriginal: true, ...decodeMasterEdition(editionAccount).data };
  } else if (editionKey === Key.EditionV1) {
    edition = { isOriginal: false, ...decodeEdition(editionAccount).data };
  } else {
    // Not an edition account: leave the edition out.
    return digitalAsset;
  }

  return { ...digitalAsset, edition };
}
