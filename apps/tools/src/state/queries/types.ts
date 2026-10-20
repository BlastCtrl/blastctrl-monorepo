/**
 * Digital Asset Standard (DAS) types, declared against the Metaplex reference
 * implementation that Triton runs (`digital-asset-rpc-infrastructure`). Only
 * the parameters and fields this app reads are declared; extend them when a
 * tool needs more. Optionality follows the Rust structs: a field that is
 * `Option<>` there is omitted from the JSON when absent.
 */

/** `getAsset` params. `showFungible` adds `token_info` for SPL mints. */
export type GetAssetParams = {
  id: string;
  options?: { showFungible?: boolean };
};

/**
 * `getAssets` (Helius: `getAssetBatch`) params. At most 1000 ids per call;
 * ids that are not found come back as `null` in the same position.
 */
export type GetAssetsParams = { ids: string[] };

/**
 * `searchAssets` params. `tokenType` is spelled the way the RPC wants it:
 * the reference enum is PascalCase (`"Fungible"`), but the RPC in use rejects
 * that with "unknown variant, expected one of `fungible`, `nonFungible`, …",
 * so these are the camelCase spellings. Default `limit` is 1000, the maximum.
 */
export type SearchAssetsParams = {
  ownerAddress?: string;
  authorityAddress?: string;
  tokenType?:
    "fungible" | "nonFungible" | "regularNFT" | "compressedNFT" | "all";
};

export type SearchAssetsResult = {
  total: number;
  limit: number;
  items: DasAsset[];
};

/** A DAS asset, trimmed to the fields the app reads. */
export type DasAsset = {
  id: string;
  mutable: boolean;
  burnt: boolean;
  content?: {
    json_uri: string;
    /** Free-form off-chain metadata; `name` and `symbol` are usually set. */
    metadata: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  authorities?: { address: string; scopes: string[] }[];
  creators?: { address: string; share: number; verified: boolean }[];
  royalty?: { basis_points: number; primary_sale_happened: boolean };
  /**
   * SPL mint info, present when requested with `showFungible`. `symbol` is a
   * provider extension: Triton documents it, the reference struct lacks it.
   */
  token_info?: { decimals: number; symbol?: string };
};
