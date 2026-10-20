import type { TokenMetadata } from "@/lib/solana/metaplex-token-metadata";
import {
  addToCollectionInstructions,
  removeFromCollectionInstructions,
  TokenStandard,
} from "@/lib/solana/metaplex-token-metadata";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  fillTransactionMessageProvisoryResourceLimits,
  getAddressDecoder,
  getTransactionSize,
  getTransactionSizeLimit,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  collectionsOf,
  invalidMintLine,
  NFTS_PER_ADD_TRANSACTION,
  NFTS_PER_REMOVE_TRANSACTION,
  parseMintList,
  planAddToCollection,
  planRemoveFromCollection,
} from "./collection-plan";

const wallet = address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx");
const other = address("So11111111111111111111111111111111111111112");
const collection = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");

let counter = 0;
const freshAddress = (): Address =>
  getAddressDecoder().decode(new Uint8Array(32).fill(++counter));

const metadata = (fields: Partial<TokenMetadata> = {}): TokenMetadata => ({
  updateAuthority: wallet,
  name: "Test",
  symbol: "TST",
  uri: "https://arweave.net/x",
  sellerFeeBasisPoints: 0,
  creators: null,
  isMutable: true,
  tokenStandard: TokenStandard.NonFungible,
  collection: null,
  ...fields,
});
const nft = (fields: Partial<TokenMetadata> | null = {}) => ({
  mint: freshAddress(),
  metadata: fields && metadata(fields),
});

describe("parseMintList", () => {
  it("takes one address per line, trimmed, once each", () => {
    expect(parseMintList(`  ${wallet} \n\n${other}\n${wallet}\n`)).toEqual([
      wallet,
      other,
    ]);
  });

  it("points at the first line that isn't an address", () => {
    expect(invalidMintLine(`${wallet}\nnope\n${other}`)).toBe("nope");
    expect(invalidMintLine(`${wallet}\n${other}`)).toBeUndefined();
  });
});

describe("planAddToCollection", () => {
  const into = { mint: collection, metadata: metadata() };

  it("refuses a collection that isn't the wallet's to verify into", () => {
    expect(() =>
      planAddToCollection(wallet, { mint: collection, metadata: null }, []),
    ).toThrow("no metadata account");
    expect(() =>
      planAddToCollection(
        wallet,
        { mint: collection, metadata: metadata({ updateAuthority: other }) },
        [],
      ),
    ).toThrow(/update authority is So111/);
  });

  it("takes NFTs with no collection or an unverified one, and skips the rest with a reason", () => {
    const fresh = nft();
    const unverified = nft({
      collection: { key: collection, verified: false },
    });
    const missing = nft(null);
    const notMine = nft({ updateAuthority: other });
    const alreadyIn = nft({ collection: { key: collection, verified: true } });
    const elsewhere = nft({ collection: { key: other, verified: true } });

    const plan = planAddToCollection(wallet, into, [
      fresh,
      unverified,
      missing,
      notMine,
      alreadyIn,
      elsewhere,
    ]);

    expect(plan.items).toEqual([
      { mint: fresh.mint, collection },
      { mint: unverified.mint, collection },
    ]);
    expect(plan.skipped).toEqual([
      { mint: missing.mint, reason: "no metadata account" },
      { mint: notMine.mint, reason: "its update authority is So11...1112" },
      { mint: alreadyIn.mint, reason: "already in the collection" },
      {
        mint: elsewhere.mint,
        reason:
          "in another collection, So11...1112; remove it from there first",
      },
    ]);
  });
});

describe("planRemoveFromCollection", () => {
  it("lists the verified collections once each", () => {
    const nfts = [
      nft({ collection: { key: collection, verified: true } }),
      nft({ collection: { key: collection, verified: true } }),
      nft({ collection: { key: other, verified: false } }),
      nft(null),
    ];
    expect(collectionsOf(nfts)).toEqual([collection]);
  });

  it("goes by each NFT's own collection and that collection's authority", () => {
    const mine = nft({ collection: { key: collection, verified: true } });
    const theirs = nft({ collection: { key: other, verified: true } });
    const unverified = nft({
      collection: { key: collection, verified: false },
    });
    const missing = nft(null);
    const collections = new Map<Address, TokenMetadata | null>([
      [collection, metadata()],
      [other, metadata({ updateAuthority: other })],
    ]);

    const plan = planRemoveFromCollection(
      wallet,
      [mine, theirs, unverified, missing],
      collections,
    );

    expect(plan.items).toEqual([{ mint: mine.mint, collection }]);
    expect(plan.skipped).toEqual([
      {
        mint: theirs.mint,
        reason: "the collection's update authority is So11...1112",
      },
      { mint: unverified.mint, reason: "not in a verified collection" },
      { mint: missing.mint, reason: "no metadata account" },
    ]);
  });

  it("falls back to the NFT's own authority once the collection is burned", () => {
    const mine = nft({ collection: { key: collection, verified: true } });
    const notMine = nft({
      updateAuthority: other,
      collection: { key: collection, verified: true },
    });
    const burned = new Map<Address, TokenMetadata | null>([[collection, null]]);

    const plan = planRemoveFromCollection(wallet, [mine, notMine], burned);

    expect(plan.items).toEqual([{ mint: mine.mint, collection }]);
    expect(plan.skipped).toEqual([
      { mint: notMine.mint, reason: "its update authority is So11...1112" },
    ]);
  });
});

describe("NFTs per transaction", () => {
  const lifetime = {
    blockhash: "11111111111111111111111111111111" as Blockhash,
    lastValidBlockHeight: 1n,
  };
  /** As the kit client builds it: one signature slot, a compute-limit placeholder. */
  const message = (instructions: Instruction[]) =>
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(wallet), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
      fillTransactionMessageProvisoryResourceLimits,
    );
  const wireSize = (instructions: Instruction[]) =>
    getTransactionSize(compileTransaction(message(instructions)));
  const PACKET_SIZE = getTransactionSizeLimit(compileTransaction(message([])));
  // What a wallet like Phantom adds when the transaction sets no price.
  const setComputeUnitPrice: Instruction = {
    programAddress: address("ComputeBudget111111111111111111111111111111"),
    data: new Uint8Array([3, 16, 39, 0, 0, 0, 0, 0, 0]),
  };
  const adds = (n: number) =>
    Array.from({ length: n }, () =>
      addToCollectionInstructions(wallet, freshAddress(), collection),
    ).flat();
  const removes = (n: number) =>
    Array.from({ length: n }, () =>
      removeFromCollectionInstructions(wallet, freshAddress(), collection),
    ).flat();

  it("adds as many as fit in a packet next to a wallet's priority fee", () => {
    expect(
      wireSize([...adds(NFTS_PER_ADD_TRANSACTION), setComputeUnitPrice]),
    ).toBeLessThanOrEqual(PACKET_SIZE);
    expect(
      wireSize([...adds(NFTS_PER_ADD_TRANSACTION + 1), setComputeUnitPrice]),
    ).toBeGreaterThan(PACKET_SIZE);
  });

  it("removes well within a packet", () => {
    expect(
      wireSize([...removes(NFTS_PER_REMOVE_TRANSACTION), setComputeUnitPrice]),
    ).toBeLessThanOrEqual(PACKET_SIZE);
  });
});
