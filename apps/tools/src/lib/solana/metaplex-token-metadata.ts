import {
  createMetadataAccountV3,
  createV1,
  findMetadataPda,
  getMetadataAccountDataSerializer,
  mintV1,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  printSupply,
  TokenStandard,
  unverifyCollectionV1,
  updateMetadataAccountV2,
  updateV1,
  verifyCollectionV1,
  verifyCreatorV1,
  type CreatorArgs,
  type DataV2Args,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import { chunk } from "../utils";
import {
  fromUmiOption,
  getUmi,
  toKitInstructions,
  toUmiBasisPoints,
  toUmiPublicKey,
  toUmiSigner,
} from "./metaplex-umi";

export { TokenStandard };

export const TOKEN_METADATA_PROGRAM_ADDRESS = address(
  MPL_TOKEN_METADATA_PROGRAM_ID,
);

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

/** A royalty recipient as stored in the metadata account. */
export type NftCreator = {
  address: Address;
  /** Percentage of royalties, 0–100; shares must add up to 100. */
  share: number;
  verified: boolean;
};

const toUmiCreator = (creator: NftCreator): CreatorArgs => ({
  address: toUmiPublicKey(creator.address),
  share: creator.share,
  verified: creator.verified,
});

export type CreateNftFields = {
  name: string;
  symbol: string;
  uri: string;
  /** Royalties in basis points, 0–10000. */
  sellerFeeBasisPoints: number;
  /**
   * Omit to let the program default apply: the wallet as the single, verified
   * creator. A creator marked `verified` must sign, so only the wallet's own
   * entry may be.
   */
  creators?: NftCreator[];
  isMutable: boolean;
  /** Mark the NFT as a sized collection parent (`collectionDetails` is set). */
  isCollection: boolean;
  /** Maximum number of print editions; 0 disallows printing. */
  maxSupply: number;
};

/**
 * Mints a Token Metadata NFT to `wallet`: `createV1` (mint, metadata and
 * master edition) followed by `mintV1` of the single token. `wallet` pays and
 * becomes the update authority. `mint` is a fresh keypair signer; it is
 * attached to the instructions so the kit client signs with it.
 */
export function createNftInstructions(
  wallet: Address,
  mint: TransactionSigner,
  fields: CreateNftFields,
): Instruction[] {
  const umi = getUmi();
  const walletSigner = toUmiSigner(wallet);
  const walletKey = toUmiPublicKey(wallet);
  const mintKey = toUmiPublicKey(mint.address);

  const builder = createV1(umi, {
    mint: toUmiSigner(mint.address),
    authority: walletSigner,
    payer: walletSigner,
    updateAuthority: walletKey,
    name: fields.name,
    symbol: fields.symbol,
    uri: fields.uri,
    sellerFeeBasisPoints: toUmiBasisPoints(fields.sellerFeeBasisPoints),
    creators: fields.creators?.map(toUmiCreator),
    isMutable: fields.isMutable,
    isCollection: fields.isCollection,
    tokenStandard: TokenStandard.NonFungible,
    printSupply:
      fields.maxSupply === 0
        ? printSupply("Zero")
        : printSupply("Limited", [fields.maxSupply]),
  }).add(
    mintV1(umi, {
      mint: mintKey,
      tokenOwner: walletKey,
      authority: walletSigner,
      payer: walletSigner,
      tokenStandard: TokenStandard.NonFungible,
      amount: 1,
    }),
  );

  return toKitInstructions(builder, [mint]);
}

/**
 * The collection an NFT points at, and whether the collection's authority has
 * verified that. Only a verified link counts; anyone can write the key.
 */
export type NftCollection = {
  key: Address;
  verified: boolean;
};

/** The `Data` struct of a metadata account, which `updateV1` replaces as one. */
export type TokenMetadataData = {
  name: string;
  symbol: string;
  uri: string;
  /** Royalties in basis points, 0–10000. */
  sellerFeeBasisPoints: number;
  creators: NftCreator[] | null;
};

/**
 * What this app reads from a metadata account: the `Data` struct it writes
 * back with `updateV1`, plus what the tools check before writing: the update
 * authority, mutability, the token standard and the collection link.
 */
export type TokenMetadata = TokenMetadataData & {
  updateAuthority: Address;
  isMutable: boolean;
  /** Null on metadata from before token standards existed. */
  tokenStandard: TokenStandard | null;
  collection: NftCollection | null;
};

/** The metadata PDA of `mint`. */
export const findMetadataAddress = (mint: Address): Address =>
  address(findMetadataPda(getUmi(), { mint: toUmiPublicKey(mint) })[0]);

/**
 * Decoded with the program client's serializer rather than Umi's RPC, since
 * the app's Umi never talks to a node. The program null-pads the strings on
 * chain; Umi's utf8 decoder strips that, so they come back clean.
 */
function decodeTokenMetadata(bytes: Uint8Array): TokenMetadata {
  const [data] = getMetadataAccountDataSerializer().deserialize(bytes);
  const collection = fromUmiOption(data.collection);
  return {
    updateAuthority: address(data.updateAuthority),
    name: data.name,
    symbol: data.symbol,
    uri: data.uri,
    sellerFeeBasisPoints: data.sellerFeeBasisPoints,
    creators:
      fromUmiOption(data.creators)?.map((creator) => ({
        address: address(creator.address),
        share: creator.share,
        verified: creator.verified,
      })) ?? null,
    isMutable: data.isMutable,
    tokenStandard: fromUmiOption(data.tokenStandard),
    collection: collection && {
      key: address(collection.key),
      verified: collection.verified,
    },
  };
}

/**
 * The metadata of an account that may be anything: null unless the Token
 * Metadata program owns it and its bytes decode.
 */
function decodeIfTokenMetadata(
  account: { programAddress: Address; data: Uint8Array } | null,
): TokenMetadata | null {
  if (!account || account.programAddress !== TOKEN_METADATA_PROGRAM_ADDRESS) {
    return null;
  }
  try {
    return decodeTokenMetadata(account.data);
  } catch {
    return null;
  }
}

/** Reads the Token Metadata account of `mint`; null when the mint has none. */
export async function fetchTokenMetadata(
  rpc: Rpc<GetAccountInfoApi>,
  mint: Address,
): Promise<TokenMetadata | null> {
  const account = await fetchEncodedAccount(rpc, findMetadataAddress(mint));
  return account.exists ? decodeTokenMetadata(account.data) : null;
}

/** The most accounts one `getMultipleAccounts` request may ask for. */
const ACCOUNTS_PER_REQUEST = 100;

/**
 * {@link fetchTokenMetadata} for many mints at once, a hundred accounts per
 * request. Same order as `mints`; null for each mint without metadata, which
 * includes an address that isn't a mint at all.
 */
export async function fetchTokenMetadatas(
  rpc: Rpc<GetMultipleAccountsApi>,
  mints: Address[],
): Promise<(TokenMetadata | null)[]> {
  const accounts = await Promise.all(
    chunk(mints.map(findMetadataAddress), ACCOUNTS_PER_REQUEST).map(
      (addresses) =>
        fetchEncodedAccounts(rpc, addresses, { commitment: "confirmed" }),
    ),
  );
  return accounts
    .flat()
    .map((account) => decodeIfTokenMetadata(account.exists ? account : null));
}

export type UpdateNftFields = {
  /**
   * The whole `Data` struct, which the program replaces as one. Omit to leave
   * it untouched, which immutable metadata requires.
   */
  data?: TokenMetadataData;
  newUpdateAuthority?: Address;
  isMutable?: boolean;
  primarySaleHappened?: boolean;
};

/**
 * Updates the metadata of `mint` with `updateV1`. `wallet` must be the update
 * authority. Each omitted field is left as it is.
 */
export function updateNftInstructions(
  wallet: Address,
  mint: Address,
  fields: UpdateNftFields,
): Instruction[] {
  const authority = toUmiSigner(wallet);
  return toKitInstructions(
    updateV1(getUmi(), {
      mint: toUmiPublicKey(mint),
      authority,
      payer: authority,
      newUpdateAuthority: fields.newUpdateAuthority
        ? toUmiPublicKey(fields.newUpdateAuthority)
        : undefined,
      data: fields.data
        ? {
            ...fields.data,
            creators: fields.data.creators?.map(toUmiCreator) ?? null,
          }
        : undefined,
      isMutable: fields.isMutable,
      primarySaleHappened: fields.primarySaleHappened,
    }),
  );
}

/**
 * Puts `mint` into `collection`, verified, in the two steps the program
 * wants: `updateV1` writes the collection key, which can only be written
 * unverified, then `verifyCollectionV1` verifies it. `wallet` must be the
 * update authority of the NFT for the first and of the collection for the
 * second.
 */
export function addToCollectionInstructions(
  wallet: Address,
  mint: Address,
  collection: Address,
): Instruction[] {
  const umi = getUmi();
  const authority = toUmiSigner(wallet);
  const collectionMint = toUmiPublicKey(collection);
  return toKitInstructions(
    updateV1(umi, {
      mint: toUmiPublicKey(mint),
      authority,
      payer: authority,
      collection: {
        __kind: "Set",
        fields: [{ key: collectionMint, verified: false }],
      },
    }).add(
      verifyCollectionV1(umi, {
        authority,
        metadata: findMetadataPda(umi, { mint: toUmiPublicKey(mint) }),
        collectionMint,
      }),
    ),
  );
}

/**
 * Takes `mint` out of `collection` by unverifying the link. The metadata
 * keeps the collection key, marked unverified, which is what wallets and
 * marketplaces go by. `wallet` must be the update authority of the
 * collection, or of the NFT itself once the collection has been burned.
 */
export function removeFromCollectionInstructions(
  wallet: Address,
  mint: Address,
  collection: Address,
): Instruction[] {
  const umi = getUmi();
  return toKitInstructions(
    unverifyCollectionV1(umi, {
      authority: toUmiSigner(wallet),
      metadata: findMetadataPda(umi, { mint: toUmiPublicKey(mint) }),
      collectionMint: toUmiPublicKey(collection),
    }),
  );
}

/**
 * Marks `wallet` as a verified creator of `mint`. The wallet must already be
 * in the creator list; verifying is the one change to a creator entry that
 * the creator makes, so no update authority is needed.
 */
export function verifyCreatorInstructions(
  wallet: Address,
  mint: Address,
): Instruction[] {
  const umi = getUmi();
  return toKitInstructions(
    verifyCreatorV1(umi, {
      authority: toUmiSigner(wallet),
      metadata: findMetadataPda(umi, { mint: toUmiPublicKey(mint) }),
    }),
  );
}
