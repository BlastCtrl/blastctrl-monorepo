// Ported from metaplex-foundation/mpl-token-metadata clients/js-kit/src/hooked/digitalAssetWithToken.ts (Apache-2.0).
/**
 * A digital asset together with one token account holding it and, for
 * programmable NFTs, that token account's token record.
 */
import {
  assertAccountExists,
  decodeAccount,
  fetchEncodedAccounts,
  type Address,
  type EncodedAccount,
  type FetchAccountConfig,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";
import { getTokenDecoder, type Token } from "@solana-program/token";

import {
  decodeTokenRecord,
  type TokenRecord,
} from "../generated/accounts/tokenRecord";
import {
  findMasterEditionPda,
  findMetadataPda,
  findTokenRecordPda,
} from "../generated/pdas";
import { deserializeDigitalAsset, type DigitalAsset } from "./digitalAsset";
import { findAssociatedTokenPda } from "./pdas";

/**
 * A digital asset with token account information: the SPL token account and,
 * for programmable NFTs, its token record.
 */
export type DigitalAssetWithToken<TMint extends string = string> =
  DigitalAsset<TMint> & {
    /** The SPL token account. */
    token: Token;
    /** The token record (for programmable NFTs). */
    tokenRecord?: TokenRecord;
  };

/**
 * Fetches a digital asset along with a specific token account: mint,
 * metadata, edition, token account and token record in one RPC call.
 *
 * @example
 * ```ts
 * const asset = await fetchDigitalAssetWithToken(rpc, mintAddress, tokenAddress);
 * console.log("Owner:", asset.token.owner);
 * console.log("Amount:", asset.token.amount);
 * ```
 */
export async function fetchDigitalAssetWithToken<TMint extends string = string>(
  rpc: Rpc<GetMultipleAccountsApi>,
  mint: Address<TMint>,
  tokenAddress: Address,
  config?: FetchAccountConfig,
): Promise<DigitalAssetWithToken<TMint>> {
  const [metadataAddress] = await findMetadataPda({ mint });
  const [editionAddress] = await findMasterEditionPda({ mint });
  const [tokenRecordAddress] = await findTokenRecordPda({
    mint,
    token: tokenAddress,
  });

  const [
    mintAccount,
    metadataAccount,
    editionAccount,
    tokenAccount,
    tokenRecordAccount,
  ] = await fetchEncodedAccounts(
    rpc,
    [mint, metadataAddress, editionAddress, tokenAddress, tokenRecordAddress],
    config,
  );

  if (
    !mintAccount ||
    !metadataAccount ||
    !editionAccount ||
    !tokenAccount ||
    !tokenRecordAccount
  ) {
    throw new Error("Expected five accounts from getMultipleAccounts");
  }
  assertAccountExists(mintAccount);
  assertAccountExists(metadataAccount);
  assertAccountExists(tokenAccount);

  return deserializeDigitalAssetWithToken(
    mint,
    mintAccount,
    metadataAccount,
    tokenAccount,
    editionAccount.exists ? editionAccount : undefined,
    tokenRecordAccount.exists ? tokenRecordAccount : undefined,
  );
}

/**
 * Fetches a digital asset with `owner`'s associated token account for it.
 *
 * @example
 * ```ts
 * const asset = await fetchDigitalAssetWithAssociatedToken(
 *   rpc,
 *   mintAddress,
 *   walletAddress,
 * );
 * console.log("Balance:", asset.token.amount);
 * ```
 */
export async function fetchDigitalAssetWithAssociatedToken<
  TMint extends string = string,
>(
  rpc: Rpc<GetMultipleAccountsApi>,
  mint: Address<TMint>,
  owner: Address,
  config?: FetchAccountConfig,
): Promise<DigitalAssetWithToken<TMint>> {
  const [tokenAddress] = await findAssociatedTokenPda({ mint, owner });
  return fetchDigitalAssetWithToken(rpc, mint, tokenAddress, config);
}

/**
 * Decodes a digital asset with token from its encoded accounts.
 */
export function deserializeDigitalAssetWithToken<TMint extends string = string>(
  mintAddress: Address<TMint>,
  mintAccount: EncodedAccount,
  metadataAccount: EncodedAccount,
  tokenAccount: EncodedAccount,
  editionAccount?: EncodedAccount,
  tokenRecordAccount?: EncodedAccount,
): DigitalAssetWithToken<TMint> {
  const digitalAsset = deserializeDigitalAsset(
    mintAddress,
    mintAccount,
    metadataAccount,
    editionAccount,
  );
  const token = decodeAccount(tokenAccount, getTokenDecoder());
  const tokenRecord = tokenRecordAccount
    ? decodeTokenRecord(tokenRecordAccount).data
    : undefined;

  return {
    ...digitalAsset,
    token: token.data,
    tokenRecord,
  };
}
