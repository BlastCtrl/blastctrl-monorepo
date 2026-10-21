/**
 * Token Metadata on the kit program client `@blastctrl/mpl-token-metadata`
 * (Codama-generated). The builders return kit instructions for the kit client
 * to plan, sign and send.
 *
 * Every builder takes the signing authority as a `TransactionSigner` and
 * passes that very object into the generated builders, so the instructions
 * carry the signer the client signs with: `client.payer` for the connected
 * wallet (kit refuses two different signers for one address, so don't wrap
 * the wallet's address in a noop signer), or `createNoopSigner(vault)` for an
 * account that signs elsewhere, such as a Squads vault. A keypair that must
 * sign, like a new mint, is passed as its own signer the same way.
 *
 * The builders are async because kit derives PDAs (the metadata and master
 * edition accounts) asynchronously.
 */
import {
  findMetadataPda,
  getCreateMetadataAccountV3InstructionAsync,
  getCreateV1InstructionAsync,
  getMetadataDecoder,
  getMintV1InstructionAsync,
  getUnverifyCollectionV1InstructionAsync,
  getUpdateMetadataAccountV2Instruction,
  getUpdateV1InstructionAsync,
  getVerifyCollectionV1InstructionAsync,
  getVerifyCreatorV1Instruction,
  MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
  printSupply,
  TokenStandard,
  type DataV2Args,
} from "@blastctrl/mpl-token-metadata";
import {
  fetchEncodedAccount,
  fetchEncodedAccounts,
  unwrapOption,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type Instruction,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import { chunk } from "../utils";

export { TokenStandard };

export const TOKEN_METADATA_PROGRAM_ADDRESS: Address =
  MPL_TOKEN_METADATA_PROGRAM_ADDRESS;

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

/** The metadata PDA of `mint`. */
export const findMetadataAddress = async (mint: Address): Promise<Address> =>
  (await findMetadataPda({ mint }))[0];

/**
 * Creates the Metaplex metadata account for `mint`. `authority` must be the
 * mint authority; it pays for the account and becomes the update authority.
 */
export async function createMetadataInstructions(
  authority: TransactionSigner,
  mint: Address,
  fields: Partial<TokenMetadataFields>,
): Promise<Instruction[]> {
  return [
    await getCreateMetadataAccountV3InstructionAsync({
      mint,
      mintAuthority: authority,
      payer: authority,
      updateAuthority: authority.address,
      data: dataV2(fields),
      isMutable: true,
      collectionDetails: null,
    }),
  ];
}

/** Rewrites the metadata of `mint`. `authority` must be the update authority. */
export async function updateMetadataInstructions(
  authority: TransactionSigner,
  mint: Address,
  fields: Partial<TokenMetadataFields>,
): Promise<Instruction[]> {
  return [
    getUpdateMetadataAccountV2Instruction({
      metadata: await findMetadataAddress(mint),
      updateAuthority: authority,
      data: dataV2(fields),
      isMutable: true,
      primarySaleHappened: true,
    }),
  ];
}

/** A royalty recipient as stored in the metadata account. */
export type NftCreator = {
  address: Address;
  /** Percentage of royalties, 0–100; shares must add up to 100. */
  share: number;
  verified: boolean;
};

export type CreateNftFields = {
  name: string;
  symbol: string;
  uri: string;
  /** Royalties in basis points, 0–10000. */
  sellerFeeBasisPoints: number;
  /**
   * Omit to let the program default apply: the authority as the single,
   * verified creator. A creator marked `verified` must sign, so only the
   * authority's own entry may be.
   */
  creators?: NftCreator[];
  isMutable: boolean;
  /** Mark the NFT as a sized collection parent (`collectionDetails` is set). */
  isCollection: boolean;
  /** Maximum number of print editions; 0 disallows printing. */
  maxSupply: number;
};

/**
 * Mints a Token Metadata NFT to `authority`: `createV1` (mint, metadata and
 * master edition) followed by `mintV1` of the single token. `authority` pays
 * and becomes the update authority. `mint` is a fresh keypair signer; it is
 * attached to `createV1` so the kit client signs with it.
 */
export async function createNftInstructions(
  authority: TransactionSigner,
  mint: TransactionSigner,
  fields: CreateNftFields,
): Promise<Instruction[]> {
  return Promise.all([
    getCreateV1InstructionAsync({
      mint,
      authority,
      payer: authority,
      updateAuthority: authority.address,
      name: fields.name,
      symbol: fields.symbol,
      uri: fields.uri,
      sellerFeeBasisPoints: fields.sellerFeeBasisPoints,
      creators: fields.creators,
      isMutable: fields.isMutable,
      isCollection: fields.isCollection,
      tokenStandard: TokenStandard.NonFungible,
      printSupply:
        fields.maxSupply === 0
          ? printSupply("Zero")
          : printSupply("Limited", [fields.maxSupply]),
    }),
    getMintV1InstructionAsync({
      mint: mint.address,
      tokenOwner: authority.address,
      authority,
      payer: authority,
      tokenStandard: TokenStandard.NonFungible,
      amount: 1,
    }),
  ]);
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

/**
 * Decoded with the program client's `Metadata` decoder. The program null-pads
 * the strings on chain; kit's UTF-8 decoder strips the nulls, so they come
 * back clean.
 */
function decodeTokenMetadata(bytes: Uint8Array): TokenMetadata {
  const data = getMetadataDecoder().decode(bytes);
  const collection = unwrapOption(data.collection);
  return {
    updateAuthority: data.updateAuthority,
    name: data.name,
    symbol: data.symbol,
    uri: data.uri,
    sellerFeeBasisPoints: data.sellerFeeBasisPoints,
    creators:
      unwrapOption(data.creators)?.map((creator) => ({
        address: creator.address,
        share: creator.share,
        verified: creator.verified,
      })) ?? null,
    isMutable: data.isMutable,
    tokenStandard: unwrapOption(data.tokenStandard),
    collection: collection && {
      key: collection.key,
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
  const account = await fetchEncodedAccount(
    rpc,
    await findMetadataAddress(mint),
  );
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
  const addresses = await Promise.all(mints.map(findMetadataAddress));
  const accounts = await Promise.all(
    chunk(addresses, ACCOUNTS_PER_REQUEST).map((group) =>
      fetchEncodedAccounts(rpc, group, { commitment: "confirmed" }),
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
 * Updates the metadata of `mint` with `updateV1`. `authority` must be the
 * update authority; it also pays. Each omitted field is left as it is.
 */
export async function updateNftInstructions(
  authority: TransactionSigner,
  mint: Address,
  fields: UpdateNftFields,
): Promise<Instruction[]> {
  const { data } = fields;
  return [
    await getUpdateV1InstructionAsync({
      mint,
      authority,
      payer: authority,
      newUpdateAuthority: fields.newUpdateAuthority,
      data: data && {
        name: data.name,
        symbol: data.symbol,
        uri: data.uri,
        sellerFeeBasisPoints: data.sellerFeeBasisPoints,
        creators: data.creators,
      },
      isMutable: fields.isMutable,
      primarySaleHappened: fields.primarySaleHappened,
    }),
  ];
}

/**
 * Puts `mint` into `collection`, verified, in the two steps the program
 * wants: `updateV1` writes the collection key, which can only be written
 * unverified, then `verifyCollectionV1` verifies it. `authority` must be the
 * update authority of the NFT for the first and of the collection for the
 * second.
 */
export async function addToCollectionInstructions(
  authority: TransactionSigner,
  mint: Address,
  collection: Address,
): Promise<Instruction[]> {
  const metadata = await findMetadataAddress(mint);
  return Promise.all([
    getUpdateV1InstructionAsync({
      mint,
      metadata,
      authority,
      payer: authority,
      collection: {
        __kind: "Set",
        fields: [{ key: collection, verified: false }],
      },
    }),
    getVerifyCollectionV1InstructionAsync({
      authority,
      metadata,
      collectionMint: collection,
    }),
  ]);
}

/**
 * Takes `mint` out of `collection` by unverifying the link. The metadata
 * keeps the collection key, marked unverified, which is what wallets and
 * marketplaces go by. `authority` must be the update authority of the
 * collection, or of the NFT itself once the collection has been burned.
 */
export async function removeFromCollectionInstructions(
  authority: TransactionSigner,
  mint: Address,
  collection: Address,
): Promise<Instruction[]> {
  return [
    await getUnverifyCollectionV1InstructionAsync({
      authority,
      metadata: await findMetadataAddress(mint),
      collectionMint: collection,
    }),
  ];
}

/**
 * Marks `creator` as a verified creator of `mint`. The creator must already
 * be in the creator list; verifying is the one change to a creator entry that
 * the creator makes, so no update authority is needed.
 */
export async function verifyCreatorInstructions(
  creator: TransactionSigner,
  mint: Address,
): Promise<Instruction[]> {
  return [
    getVerifyCreatorV1Instruction({
      authority: creator,
      metadata: await findMetadataAddress(mint),
    }),
  ];
}
