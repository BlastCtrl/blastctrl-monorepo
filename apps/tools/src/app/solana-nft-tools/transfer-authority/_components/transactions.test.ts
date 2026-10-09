import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { address, creator, metadata } from "./fixtures";
import type { ReadyTransfer, ReadyVerify } from "./transactions";
import {
  MAX_NFTS_PER_TRANSACTION,
  MAX_TRANSACTION_BYTES,
  packBatches,
  transactionSize,
  transferInstruction,
  verifyInstruction,
} from "./transactions";

// Building instructions needs no RPC; the endpoint is never called.
const umi = createUmi("http://127.0.0.1:8899").use(mplTokenMetadata());
const wallet = address();
const feePayer = new PublicKey(wallet);
const newAuthority = address();

const transfer = (overrides: Parameters<typeof metadata>[0] = {}) => {
  const md = metadata({ updateAuthority: wallet, ...overrides });
  const plan: ReadyTransfer = {
    status: "ready",
    mint: md.mint,
    name: md.name,
    metadata: md,
    creators: [creator(newAuthority, 100)],
  };
  return {
    mint: plan.mint,
    instruction: transferInstruction(umi, plan, wallet, newAuthority),
  };
};

const verify = () => {
  const md = metadata({ creators: [creator(wallet, 100)] });
  const plan: ReadyVerify = {
    status: "ready",
    mint: md.mint,
    name: md.name,
    metadata: md,
  };
  return { mint: plan.mint, instruction: verifyInstruction(umi, plan, wallet) };
};

describe("transferInstruction", () => {
  it("is signed by the wallet and writes the NFT's metadata account", () => {
    const md = metadata({ updateAuthority: wallet });
    const { instruction } = transfer({
      publicKey: md.publicKey,
      mint: md.mint,
    });
    expect(instruction.programId.toBase58()).toBe(
      MPL_TOKEN_METADATA_PROGRAM_ID,
    );
    const signers = instruction.keys.filter((k) => k.isSigner);
    expect(signers.map((k) => k.pubkey.toBase58())).toEqual([wallet, wallet]);
    const writable = instruction.keys.find(
      (k) => k.pubkey.toBase58() === md.publicKey,
    );
    expect(writable?.isWritable).toBe(true);
  });

  it("sends trimmed strings, not the null padding", () => {
    const padded = transfer({
      name: "Name".padEnd(32, "\0"),
      symbol: "SYM".padEnd(10, "\0"),
      uri: "https://example.com".padEnd(200, "\0"),
    });
    const trimmed = transfer({
      name: "Name",
      symbol: "SYM",
      uri: "https://example.com",
    });
    expect(padded.instruction.data.length).toBe(
      trimmed.instruction.data.length,
    );
  });
});

describe("packBatches", () => {
  it("keeps every transaction under the byte limit", () => {
    const items = Array.from({ length: 25 }, () =>
      transfer({ uri: `https://arweave.net/${"x".repeat(43)}` }),
    );
    const batches = packBatches(items, feePayer);
    expect(batches.flatMap((b) => b.mints)).toEqual(items.map((i) => i.mint));
    for (const batch of batches) {
      expect(transactionSize(batch.instructions, feePayer)).toBeLessThanOrEqual(
        MAX_TRANSACTION_BYTES,
      );
    }
    // Several updates share a transaction.
    expect(batches[0]!.mints.length).toBeGreaterThan(1);
  });

  it("caps verifications per transaction, though more would fit", () => {
    const items = Array.from({ length: 25 }, verify);
    const batches = packBatches(items, feePayer);
    expect(batches.map((b) => b.mints.length)).toEqual([
      MAX_NFTS_PER_TRANSACTION,
      MAX_NFTS_PER_TRANSACTION,
      5,
    ]);
    expect(batches.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it("gives an oversized instruction a transaction of its own", () => {
    const items = [transfer(), transfer()];
    const batches = packBatches(items, feePayer, { maxBytes: 100 });
    expect(batches.map((b) => b.mints.length)).toEqual([1, 1]);
  });
});
