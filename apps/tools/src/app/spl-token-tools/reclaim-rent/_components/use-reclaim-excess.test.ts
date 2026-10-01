import { WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION } from "@/lib/solana/withdraw-excess-lamports";
import type { Connection } from "@solana/web3.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PACKET_DATA_SIZE,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { parseServiceFee } from "./fee";
import { ACCOUNTS_PER_TRANSACTION } from "./rent";
import type { ReclaimableAccount } from "./types";
import type { BatchResult } from "./use-reclaim-excess";
import {
  WalletRefusedError,
  buildReclaimTransaction,
  isWalletRefusal,
  sendBatches,
} from "./use-reclaim-excess";

/** The Token programs' `CloseAccount`. */
const CLOSE_ACCOUNT_INSTRUCTION = 9;

const wallet = Keypair.generate().publicKey;
const fee = parseServiceFee(Keypair.generate().publicKey.toBase58(), "500")!;
const lifetime = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 1,
};

const tokenAccount = (
  over: Partial<ReclaimableAccount> = {},
): ReclaimableAccount => {
  const address = Keypair.generate().publicKey.toBase58();
  return {
    id: address,
    kind: "token-account",
    address,
    mint: Keypair.generate().publicKey.toBase58(),
    symbol: "TST",
    name: "Test",
    program: "token",
    tokenBalance: "0",
    isEmpty: true,
    dataLength: 165,
    lamports: 2_039_280,
    minimum: 1_488_440,
    ...over,
  };
};

const opcodes = (accounts: ReclaimableAccount[], closeEmpty: boolean) =>
  buildReclaimTransaction(
    accounts,
    wallet,
    lifetime,
    null,
    closeEmpty,
  ).instructions.map((ix) => ix.data[0]);

/** Bytes on the wire, with the one signature slot the wallet fills in. */
const wireSize = (tx: ReturnType<typeof buildReclaimTransaction>) =>
  tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;

describe("buildReclaimTransaction, closing empty accounts", () => {
  it("closes empty token accounts and withdraws from the rest", () => {
    const accounts = [
      tokenAccount(),
      tokenAccount({ isEmpty: false, tokenBalance: "5" }),
      tokenAccount({ program: "token-2022", dataLength: 182 }),
    ];
    expect(opcodes(accounts, true)).toEqual([
      CLOSE_ACCOUNT_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      CLOSE_ACCOUNT_INSTRUCTION,
    ]);
  });

  it("closes nothing when the switch is off", () => {
    expect(opcodes([tokenAccount(), tokenAccount()], false)).toEqual([
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
    ]);
  });

  it("never closes mints or accounts the wallet can't close", () => {
    const mint = tokenAccount({
      kind: "mint",
      isEmpty: false,
      dataLength: 82,
    });
    const frozen = tokenAccount({ keepOpenReason: "Frozen" });
    expect(opcodes([mint, frozen], true)).toEqual([
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
    ]);
  });

  it("closes an empty account even when it holds no excess", () => {
    const atMinimum = tokenAccount({ lamports: 1_488_440 });
    expect(opcodes([atMinimum], true)).toEqual([CLOSE_ACCOUNT_INSTRUCTION]);
  });

  it("sends a closed account's whole deposit to the wallet", () => {
    const [close] = buildReclaimTransaction(
      [tokenAccount({ program: "token-2022" })],
      wallet,
      lifetime,
      null,
      true,
    ).instructions;
    expect(close!.keys.map((k) => k.pubkey.equals(wallet))).toEqual([
      false,
      true,
      true,
    ]);
    expect(close!.keys[2]!.isSigner).toBe(true);
  });

  it("takes the fee from the whole deposit of a closed account", () => {
    const tx = buildReclaimTransaction(
      [tokenAccount(), tokenAccount({ isEmpty: false, tokenBalance: "5" })],
      wallet,
      lifetime,
      fee,
      true,
    );
    const transfer = tx.instructions[2]!;
    expect(transfer.programId.equals(SystemProgram.programId)).toBe(true);
    // 5% of 2,039,280 (closed) + 550,840 (excess) lamports.
    expect(Number(transfer.data.readBigUInt64LE(4))).toBe(129_506);
  });
});

/**
 * A legacy transaction has to fit in one packet (1232 bytes). A full batch
 * is the worst case: every account distinct, both token programs, and the
 * fee transfer bringing in the System program and the fee recipient.
 */
describe("batch size", () => {
  const fullBatch = (empty: (i: number) => boolean) =>
    Array.from({ length: ACCOUNTS_PER_TRANSACTION }, (_, i) =>
      tokenAccount({
        program: i % 2 ? "token-2022" : "token",
        isEmpty: empty(i),
        tokenBalance: empty(i) ? "0" : "5",
      }),
    );
  const build = (accounts: ReclaimableAccount[], closeEmpty: boolean) =>
    buildReclaimTransaction(accounts, wallet, lifetime, fee, closeEmpty);

  const allEmpty = fullBatch(() => true);
  const withdrawals = build(allEmpty, false);
  const closes = build(allEmpty, true);
  const mixed = build(
    fullBatch((i) => i % 3 === 0),
    true,
  );

  it("builds the worst case it means to", () => {
    for (const tx of [withdrawals, closes, mixed]) {
      expect(tx.instructions).toHaveLength(ACCOUNTS_PER_TRANSACTION + 1);
      expect(tx.compileMessage().accountKeys).toHaveLength(
        ACCOUNTS_PER_TRANSACTION + 5,
      );
    }
  });

  it("is the same size whether accounts close or not", () => {
    expect(wireSize(closes)).toBe(wireSize(withdrawals));
    expect(wireSize(mixed)).toBe(wireSize(withdrawals));
  });

  it("fits in a packet", () => {
    expect(wireSize(withdrawals)).toBeLessThanOrEqual(PACKET_DATA_SIZE);
  });

  // Wallets like Phantom add a compute unit limit and price when the
  // transaction doesn't set them.
  it("leaves room for a wallet to add priority fee instructions", () => {
    const tx = build(allEmpty, true).add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
    );
    expect(wireSize(tx)).toBeLessThanOrEqual(PACKET_DATA_SIZE);
  });
});

describe("isWalletRefusal", () => {
  it("knows a refusal by its code or its message", () => {
    expect(isWalletRefusal(Error("User rejected the request."))).toBe(true);
    expect(isWalletRefusal(Error("Approval Denied"))).toBe(true);
    // The adapter wraps the wallet's error and keeps it as `error`.
    const wrapped = Object.assign(Error("Unexpected error"), {
      error: { code: 4001 },
    });
    expect(isWalletRefusal(wrapped)).toBe(true);
    expect(isWalletRefusal(Error("Transaction simulation failed"))).toBe(false);
    expect(isWalletRefusal(null)).toBe(false);
  });
});

describe("sendBatches with a wallet that asks per transaction", () => {
  const batches = Array.from({ length: 5 }, (_, index) => ({
    index,
    accounts: [],
  }));
  const connection = {
    getLatestBlockhash: async () => lifetime,
    confirmTransaction: async () => ({
      context: { slot: 1 },
      value: { err: null },
    }),
  } as unknown as Connection;

  /** A wallet whose `n`th prompt (from 1) throws `error`. */
  const run = async (n: number, error: Error) => {
    let prompts = 0;
    const results: BatchResult[] = [];
    const sendTransaction = async () => {
      prompts++;
      if (prompts === n) throw error;
      return `signature-${prompts}`;
    };
    const outcome = await sendBatches(
      batches,
      {
        connection,
        wallet: { signAllTransactions: undefined, sendTransaction },
        build: () => new Transaction(),
      },
      { onBatchResult: (result) => results.push(result) },
    ).catch((err: unknown) => err);
    return { outcome, prompts, results };
  };

  it("stops at a refusal and says how far it got", async () => {
    const { outcome, prompts, results } = await run(
      3,
      Error("User rejected the request."),
    );
    expect(outcome).toBeInstanceOf(WalletRefusedError);
    expect(outcome).toMatchObject({ sent: 2, of: 5 });
    expect(prompts).toBe(3);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
  });

  it("fails only the batch for any other error, and carries on", async () => {
    const { outcome, prompts, results } = await run(
      2,
      Error("Transaction simulation failed"),
    );
    expect(outcome).toBeUndefined();
    expect(prompts).toBe(5);
    expect(results.map((r) => r.status)).toEqual([
      "confirmed",
      "failed",
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
  });
});

describe("sendBatches with a wallet that signs everything at once", () => {
  it("sends nothing when the wallet refuses", async () => {
    let sent = 0;
    const outcome = await sendBatches(
      [{ index: 0, accounts: [] }],
      {
        connection: {
          getLatestBlockhash: async () => lifetime,
          sendRawTransaction: async () => `signature-${++sent}`,
        } as unknown as Connection,
        wallet: {
          signAllTransactions: async () => {
            throw Error("User rejected the request.");
          },
          sendTransaction: async () => "unused",
        },
        build: () => new Transaction(),
      },
      { onBatchResult: () => {} },
    ).catch((err: unknown) => err);
    expect(outcome).toMatchObject({ sent: 0, of: 1 });
    expect(sent).toBe(0);
  });
});
