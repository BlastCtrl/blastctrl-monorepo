import { Keypair, PACKET_DATA_SIZE } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  DEMO_MINTS,
  DEVNET_DEMO_MINTS,
  MINTS_PER_TRANSACTION,
  buildTestAccountTransactions,
  demoMintsFor,
  showsTestAccountsPanel,
} from "./test-accounts";

describe.each([
  ["mainnet", DEMO_MINTS],
  ["devnet", DEVNET_DEMO_MINTS],
])("buildTestAccountTransactions on %s", (_, mints) => {
  const wallet = Keypair.generate().publicKey;
  const lifetime = {
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1,
  };
  const txs = buildTestAccountTransactions(mints, wallet, lifetime, 550_840);

  it("has distinct demo mints on both token programs", () => {
    expect(new Set(mints.map((m) => m.program.toBase58()))).toEqual(
      new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]),
    );
    expect(new Set(mints.map((m) => m.mint.toBase58())).size).toBe(
      mints.length,
    );
  });

  it("covers every demo mint, a create and a transfer each", () => {
    expect(txs).toHaveLength(Math.ceil(mints.length / MINTS_PER_TRANSACTION));
    expect(txs.flatMap((tx) => tx.instructions)).toHaveLength(mints.length * 2);
  });

  it("fits every transaction in a packet", () => {
    for (const tx of txs) {
      expect(
        tx.serialize({ requireAllSignatures: false, verifySignatures: false })
          .length,
      ).toBeLessThanOrEqual(PACKET_DATA_SIZE);
    }
  });
});

describe("demoMintsFor", () => {
  it("picks the list for the network, and none for testnet", () => {
    expect(demoMintsFor("mainnet-beta")).toBe(DEMO_MINTS);
    expect(demoMintsFor("devnet")).toBe(DEVNET_DEMO_MINTS);
    expect(demoMintsFor("testnet")).toBeNull();
    // A custom RPC url counts as mainnet.
    expect(demoMintsFor("https://rpc.example.com")).toBe(DEMO_MINTS);
  });
});

describe("showsTestAccountsPanel", () => {
  it("shows in development, and on devnet whatever the build", () => {
    expect(showsTestAccountsPanel("mainnet-beta", "development")).toBe(true);
    expect(showsTestAccountsPanel("devnet", "development")).toBe(true);
    expect(showsTestAccountsPanel("devnet", "production")).toBe(true);
    expect(showsTestAccountsPanel("devnet", undefined)).toBe(true);
  });

  it("hides elsewhere outside development", () => {
    expect(showsTestAccountsPanel("mainnet-beta", "production")).toBe(false);
    expect(showsTestAccountsPanel("testnet", "production")).toBe(false);
    expect(showsTestAccountsPanel("https://rpc.example.com", "test")).toBe(
      false,
    );
  });
});
