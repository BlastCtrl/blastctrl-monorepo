import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  fillTransactionMessageProvisoryResourceLimits,
  getTransactionSize,
  getTransactionSizeLimit,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  DEMO_MINTS,
  DEVNET_DEMO_MINTS,
  MINTS_PER_TRANSACTION,
  buildTestAccountInstructions,
  demoMintsFor,
  showsTestAccountsPanel,
} from "./test-accounts";

const wallet = createNoopSigner(
  address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx"),
);
const lifetime = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
};

/** The transaction as the kit client would build it, one signature slot. */
const compile = (instructions: Instruction[]) =>
  compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(wallet, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
      fillTransactionMessageProvisoryResourceLimits,
    ),
  );

/** What fits in one packet for a version 0 transaction. */
const PACKET_SIZE = getTransactionSizeLimit(compile([]));

describe("the demo mint lists", () => {
  it("have mainnet mints on both token programs", () => {
    expect(new Set(DEMO_MINTS.map((m) => m.program))).toEqual(
      new Set([TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]),
    );
  });

  it("have devnet mints on a token program, Token at least", () => {
    const programs = new Set(DEVNET_DEMO_MINTS.map((m) => m.program));
    expect(programs.has(TOKEN_PROGRAM_ADDRESS)).toBe(true);
    for (const program of programs) {
      expect([TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]).toContain(
        program,
      );
    }
  });

  it.each([
    ["mainnet", DEMO_MINTS],
    ["devnet", DEVNET_DEMO_MINTS],
  ])("have distinct mints on %s", (_, mints) => {
    expect(new Set(mints.map((m) => m.mint)).size).toBe(mints.length);
  });
});

describe.each([
  ["mainnet", DEMO_MINTS],
  ["devnet", DEVNET_DEMO_MINTS],
])("buildTestAccountInstructions on %s", (_, mints) => {
  it("covers every demo mint, a create and a transfer each", async () => {
    const groups = await buildTestAccountInstructions(mints, wallet, 550_840);
    expect(groups).toHaveLength(
      Math.ceil(mints.length / MINTS_PER_TRANSACTION),
    );
    expect(groups.flat()).toHaveLength(mints.length * 2);
  });

  it("fits every transaction in a packet", async () => {
    const groups = await buildTestAccountInstructions(mints, wallet, 550_840);
    for (const instructions of groups) {
      expect(getTransactionSize(compile(instructions))).toBeLessThanOrEqual(
        PACKET_SIZE,
      );
    }
  });
});

describe("demoMintsFor", () => {
  it("picks the list for the cluster, and none for testnet", () => {
    expect(demoMintsFor("mainnet")).toBe(DEMO_MINTS);
    expect(demoMintsFor("devnet")).toBe(DEVNET_DEMO_MINTS);
    expect(demoMintsFor("testnet")).toBeNull();
    // A custom endpoint counts as mainnet.
    expect(demoMintsFor("custom")).toBe(DEMO_MINTS);
    expect(demoMintsFor(null)).toBe(DEMO_MINTS);
  });
});

describe("showsTestAccountsPanel", () => {
  it("shows in development, and on devnet whatever the build", () => {
    expect(showsTestAccountsPanel("mainnet", "development")).toBe(true);
    expect(showsTestAccountsPanel("devnet", "development")).toBe(true);
    expect(showsTestAccountsPanel("devnet", "production")).toBe(true);
    expect(showsTestAccountsPanel("devnet", undefined)).toBe(true);
  });

  it("hides elsewhere outside development", () => {
    expect(showsTestAccountsPanel("mainnet", "production")).toBe(false);
    expect(showsTestAccountsPanel("testnet", "production")).toBe(false);
    expect(showsTestAccountsPanel("custom", "test")).toBe(false);
    expect(showsTestAccountsPanel(null, "production")).toBe(false);
  });
});
