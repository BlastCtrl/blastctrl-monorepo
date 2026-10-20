import {
  createMetadataAccountV3,
  createV1,
  findMetadataPda,
  getMetadataAccountDataSerializer,
  mintV1,
  printSupply,
  TokenStandard,
  updateMetadataAccountV2,
  updateV1,
  type CreatorArgs,
  type DataV2Args,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  address,
  fetchEncodedAccount,
  type Address,
  type GetAccountInfoApi,
  type Instruction,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import {
  fromUmiOption,
  getUmi,
  toKitInstructions,
  toUmiBasisPoints,
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
 * What this app reads from a metadata account: the `Data` struct it writes
 * back with `updateV1`, plus the update authority it checks first.
 */
export type TokenMetadata = {
  updateAuthority: Address;
  name: string;
  symbol: string;
  uri: string;
  /** Royalties in basis points, 0–10000. */
  sellerFeeBasisPoints: number;
  creators: NftCreator[] | null;
};

/** The metadata PDA of `mint`. */
export const findMetadataAddress = (mint: Address): Address =>
  address(findMetadataPda(getUmi(), { mint: toUmiPublicKey(mint) })[0]);

/**
 * Reads the Token Metadata account of `mint`; null when the mint has none.
 * Decoded with the program client's serializer rather than Umi's RPC, since
 * the app's Umi never talks to a node. The program null-pads the strings on
 * chain; Umi's utf8 decoder strips that, so they come back clean.
 */
export async function fetchTokenMetadata(
  rpc: Rpc<GetAccountInfoApi>,
  mint: Address,
): Promise<TokenMetadata | null> {
  const account = await fetchEncodedAccount(rpc, findMetadataAddress(mint));
  if (!account.exists) return null;

  const [data] = getMetadataAccountDataSerializer().deserialize(account.data);
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
  };
}

export type UpdateNftFields = {
  /**
   * The whole `Data` struct, which the program replaces as one. Omit to leave
   * it untouched, which immutable metadata requires.
   */
  data?: Omit<TokenMetadata, "updateAuthority">;
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
