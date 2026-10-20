import { compress } from "@/lib/solana/common";
import type { TokenMetadata } from "@/lib/solana/metaplex-token-metadata";
import { isAddress, type Address } from "@solana/kit";

/** An NFT and the collection it is going into or coming out of. */
export type CollectionItem = { mint: Address; collection: Address };

/** An NFT left alone, and why. */
export type SkippedNft = { mint: Address; reason: string };

export type CollectionPlan = { items: CollectionItem[]; skipped: SkippedNft[] };

/**
 * NFTs per transaction. Adding is two instructions per NFT, and six is the
 * most that fit in a packet with room for a wallet to add a priority-fee
 * instruction (the test pins it). Removing is one, and twenty would fit, but
 * Phantom only adds its per-account safety assertions while they all fit and
 * warns about the dApp otherwise, so it stays at twelve (see
 * `ACCOUNTS_PER_TRANSACTION` in the reclaim-rent tool).
 */
export const NFTS_PER_ADD_TRANSACTION = 6;
export const NFTS_PER_REMOVE_TRANSACTION = 12;

/** Mint addresses, one per line; blank lines, spaces and repeats dropped. */
export const parseMintList = (text: string): string[] => [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  ),
];

/** The first line that isn't an address, for the form's error message. */
export const invalidMintLine = (text: string) =>
  parseMintList(text).find((line) => !isAddress(line));

export type NftWithMetadata = {
  mint: Address;
  metadata: TokenMetadata | null;
};

/** The mints of the verified collections `nfts` are in, each once. */
export const collectionsOf = (nfts: NftWithMetadata[]): Address[] => [
  ...new Set(
    nfts.flatMap((nft) =>
      nft.metadata?.collection?.verified ? [nft.metadata.collection.key] : [],
    ),
  ),
];

const notYours = (metadata: TokenMetadata) =>
  `its update authority is ${compress(metadata.updateAuthority, 4)}`;

/**
 * Which of `nfts` can go into the collection, and why the rest can't. Throws
 * when the collection itself is unusable, since then nothing can go in.
 */
export function planAddToCollection(
  wallet: Address,
  collection: NftWithMetadata,
  nfts: NftWithMetadata[],
): CollectionPlan {
  if (!collection.metadata) {
    throw Error("The collection mint has no metadata account");
  }
  if (collection.metadata.updateAuthority !== wallet) {
    throw Error(
      `The collection's update authority is ${collection.metadata.updateAuthority}, not the connected wallet`,
    );
  }
  return sortNfts(nfts, ({ mint, metadata }) => {
    if (!metadata) return "no metadata account";
    if (metadata.updateAuthority !== wallet) return notYours(metadata);
    if (metadata.collection?.verified) {
      // The program refuses to overwrite a verified collection.
      return metadata.collection.key === collection.mint
        ? "already in the collection"
        : `in another collection, ${compress(metadata.collection.key, 4)}; remove it from there first`;
    }
    return { mint, collection: collection.mint };
  });
}

/**
 * Which of `nfts` can come out of their collection. Each NFT's own collection
 * key is used, so the list may span collections; `collections` is the
 * metadata of those, by mint. Unverifying takes the collection's update
 * authority, or the NFT's own once the collection has been burned.
 */
export function planRemoveFromCollection(
  wallet: Address,
  nfts: NftWithMetadata[],
  collections: Map<Address, TokenMetadata | null>,
): CollectionPlan {
  return sortNfts(nfts, ({ mint, metadata }) => {
    if (!metadata) return "no metadata account";
    if (!metadata.collection?.verified) return "not in a verified collection";
    const collection = collections.get(metadata.collection.key) ?? null;
    if (!collection) {
      return metadata.updateAuthority === wallet
        ? { mint, collection: metadata.collection.key }
        : notYours(metadata);
    }
    return collection.updateAuthority === wallet
      ? { mint, collection: metadata.collection.key }
      : `the collection's update authority is ${compress(collection.updateAuthority, 4)}`;
  });
}

/** Each NFT goes to the items to send or, with a reason, to the skipped. */
function sortNfts(
  nfts: NftWithMetadata[],
  decide: (nft: NftWithMetadata) => CollectionItem | string,
): CollectionPlan {
  const plan: CollectionPlan = { items: [], skipped: [] };
  for (const nft of nfts) {
    const outcome = decide(nft);
    if (typeof outcome === "string") {
      plan.skipped.push({ mint: nft.mint, reason: outcome });
    } else {
      plan.items.push(outcome);
    }
  }
  return plan;
}
