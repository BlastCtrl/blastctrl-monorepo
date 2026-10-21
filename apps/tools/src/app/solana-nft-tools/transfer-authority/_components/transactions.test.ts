import {
  findMetadataAddress,
  TOKEN_METADATA_PROGRAM_ADDRESS,
} from "@/lib/solana/metaplex-token-metadata";
import { AccountRole, createNoopSigner, isSignerRole } from "@solana/kit";
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

const wallet = address();
const walletSigner = createNoopSigner(wallet);
const newAuthority = address();

const transfer = async (overrides: Parameters<typeof metadata>[0] = {}) => {
  const mint = address();
  const md = metadata({ updateAuthority: wallet, ...overrides });
  const plan: ReadyTransfer = {
    status: "ready",
    mint,
    name: md.name,
    metadata: md,
    creators: [creator(newAuthority, 100)],
  };
  return {
    mint,
    instruction: await transferInstruction(plan, walletSigner, newAuthority),
  };
};

const verify = async () => {
  const mint = address();
  const md = metadata({ creators: [creator(wallet, 100)] });
  const plan: ReadyVerify = {
    status: "ready",
    mint,
    name: md.name,
    metadata: md,
  };
  return { mint, instruction: await verifyInstruction(plan, walletSigner) };
};

describe("transferInstruction", () => {
  it("is signed by the wallet and writes the NFT's metadata account", async () => {
    const { mint, instruction } = await transfer();
    const metadataAddress = await findMetadataAddress(mint);
    expect(instruction.programAddress).toBe(TOKEN_METADATA_PROGRAM_ADDRESS);
    const signers = instruction.accounts!.filter((a) => isSignerRole(a.role));
    expect(signers.map((a) => a.address)).toEqual([wallet, wallet]);
    expect(
      instruction.accounts!.find((a) => a.address === metadataAddress)?.role,
    ).toBe(AccountRole.WRITABLE);
  });
});

describe("packBatches", () => {
  it("keeps every transaction under the byte limit", async () => {
    const items = await Promise.all(
      Array.from({ length: 25 }, () =>
        transfer({ uri: `https://arweave.net/${"x".repeat(43)}` }),
      ),
    );
    const batches = packBatches(items, wallet);
    expect(batches.flatMap((b) => b.mints)).toEqual(items.map((i) => i.mint));
    for (const batch of batches) {
      expect(transactionSize(batch.instructions, wallet)).toBeLessThanOrEqual(
        MAX_TRANSACTION_BYTES,
      );
    }
    // Several updates share a transaction.
    expect(batches[0]!.mints.length).toBeGreaterThan(1);
  });

  it("caps verifications per transaction, though more would fit", async () => {
    const items = await Promise.all(Array.from({ length: 25 }, () => verify()));
    const batches = packBatches(items, wallet);
    expect(batches.map((b) => b.mints.length)).toEqual([
      MAX_NFTS_PER_TRANSACTION,
      MAX_NFTS_PER_TRANSACTION,
      5,
    ]);
    expect(batches.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it("gives an oversized instruction a transaction of its own", async () => {
    const items = await Promise.all([transfer(), transfer()]);
    const batches = packBatches(items, wallet, { maxBytes: 100 });
    expect(batches.map((b) => b.mints.length)).toEqual([1, 1]);
  });
});
