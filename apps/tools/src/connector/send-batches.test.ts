import {
  SolanaError,
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  type Address,
  type Blockhash,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  WalletRefusedError,
  isWalletRefusal,
  sendBatches,
  type BatchResult,
  type BatchSender,
  type BlockhashLifetime,
  type PreparedTransaction,
} from "./send-batches";

const lifetime: BlockhashLifetime = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
};
const batches = Array.from({ length: 5 }, (_, index) => ({ index }));
const noop: Instruction = {
  programAddress: "11111111111111111111111111111111" as Address,
};
/** A stand-in transaction; `n` tells them apart. */
const transaction = (n: number) =>
  ({
    messageBytes: new Uint8Array([n]),
    signatures: {},
  }) as unknown as PreparedTransaction;

/** A sender whose wallet signs everything in one prompt. */
const senderWith = (over: Partial<BatchSender> = {}): BatchSender => {
  let sent = 0;
  return {
    latestBlockhash: async () => lifetime,
    prepare: async (instructions) => transaction(instructions.length),
    sign: async (transactions) => transactions,
    sendAndConfirm: async () => `signature-${++sent}` as Signature,
    ...over,
  };
};

/** A wallet that asks per transaction; its `n`th prompt (from 1) throws `error`. */
const perTransactionWallet = (n = 0, error = Error("unused")) => {
  const state = { prompts: 0 };
  const sign: BatchSender["sign"] = async (transactions) => {
    if (transactions.length > 1) {
      throw new SolanaError(
        SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
      );
    }
    state.prompts++;
    if (state.prompts === n) throw error;
    return transactions;
  };
  return { state, sign };
};

const run = async (sender: BatchSender, list = batches) => {
  const results: BatchResult[] = [];
  const stages: string[] = [];
  const outcome = await sendBatches(
    list,
    // The batch's index as the number of instructions, so `prepare` can tell
    // which batch it has.
    { sender, build: (batch) => Array<Instruction>(batch.index).fill(noop) },
    {
      onBatchResult: (result) => results.push(result),
      onStage: (index, stage) => stages.push(`${index}:${stage}`),
    },
  ).then(
    () => undefined,
    (err: unknown) => err,
  );
  return { outcome, results, stages };
};

describe("sendBatches with a wallet that signs everything at once", () => {
  it("asks once, then sends and confirms side by side", async () => {
    const prompts: number[] = [];
    const { outcome, results, stages } = await run(
      senderWith({
        sign: async (transactions) => {
          prompts.push(transactions.length);
          return transactions;
        },
      }),
    );
    expect(outcome).toBeUndefined();
    expect(prompts).toEqual([5]);
    expect(results.map((r) => r.status)).toEqual(Array(5).fill("confirmed"));
    expect(stages).toEqual([
      ...batches.map((b) => `${b.index}:signing`),
      ...batches.map((b) => `${b.index}:confirming`),
    ]);
  });

  it("sends nothing when the wallet refuses", async () => {
    let sent = 0;
    const { outcome, results } = await run(
      senderWith({
        sign: async () => {
          throw Error("User rejected the request.");
        },
        sendAndConfirm: async () => `signature-${++sent}` as Signature,
      }),
    );
    expect(outcome).toBeInstanceOf(WalletRefusedError);
    expect(outcome).toMatchObject({ sent: 0, of: 5 });
    expect(sent).toBe(0);
    expect(results).toEqual([]);
  });

  it("fails a batch that can't be planned on its own and sends the rest", async () => {
    const prompts: number[] = [];
    const { outcome, results } = await run(
      senderWith({
        prepare: async (instructions) => {
          if (instructions.length === 1) throw Error("simulation failed");
          return transaction(instructions.length);
        },
        sign: async (transactions) => {
          prompts.push(transactions.length);
          return transactions;
        },
      }),
    );
    expect(outcome).toBeUndefined();
    expect(prompts).toEqual([4]);
    expect(results.find((r) => r.index === 1)).toMatchObject({
      status: "failed",
      error: "simulation failed",
    });
    expect(results.filter((r) => r.status === "confirmed")).toHaveLength(4);
  });

  it("throws, with nothing sent, when the chain gives no blockhash", async () => {
    const { outcome, results } = await run(
      senderWith({
        latestBlockhash: async () => {
          throw Error("fetch failed");
        },
      }),
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(WalletRefusedError);
    expect(results).toEqual([]);
  });
});

describe("sendBatches with a wallet that asks per transaction", () => {
  it("stops at a refusal and says how far it got", async () => {
    const wallet = perTransactionWallet(3, Error("User rejected the request."));
    const { outcome, results } = await run(senderWith({ sign: wallet.sign }));
    expect(outcome).toBeInstanceOf(WalletRefusedError);
    expect(outcome).toMatchObject({ sent: 2, of: 5 });
    expect(wallet.state.prompts).toBe(3);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
  });

  it("fails only the batch for any other error, and carries on", async () => {
    const wallet = perTransactionWallet(
      2,
      Error("Transaction simulation failed"),
    );
    const { outcome, results } = await run(senderWith({ sign: wallet.sign }));
    expect(outcome).toBeUndefined();
    expect(wallet.state.prompts).toBe(5);
    expect(results.map((r) => r.status)).toEqual([
      "confirmed",
      "failed",
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
  });

  describe("when the RPC stops giving out blockhashes", () => {
    /** Blockhashes come until `n` have been handed out, then fail. */
    const runFailingAfter = (n: number) => {
      let handedOut = 0;
      const wallet = perTransactionWallet();
      return run(
        senderWith({
          latestBlockhash: async () => {
            if (handedOut === n) throw Error("fetch failed");
            handedOut++;
            return lifetime;
          },
          sign: wallet.sign,
        }),
      ).then((r) => ({ ...r, prompts: wallet.state.prompts }));
    };

    it("fails the rest once some have gone out, instead of saying nothing was sent", async () => {
      // One blockhash for the shared attempt, then one per batch.
      const { outcome, prompts, results } = await runFailingAfter(3);
      expect(outcome).toBeUndefined();
      expect(prompts).toBe(2);
      expect(results.map((r) => r.status)).toEqual([
        "confirmed",
        "confirmed",
        "failed",
        "failed",
        "failed",
      ]);
    });

    it("throws when nothing has gone out yet", async () => {
      const { outcome, prompts, results } = await runFailingAfter(1);
      expect(outcome).toBeInstanceOf(Error);
      expect(outcome).not.toBeInstanceOf(WalletRefusedError);
      expect(prompts).toBe(0);
      expect(results).toEqual([]);
    });
  });
});

describe("isWalletRefusal", () => {
  it("knows a refusal by its code or its message", () => {
    expect(isWalletRefusal(Error("User rejected the request."))).toBe(true);
    expect(isWalletRefusal(Error("Approval Denied"))).toBe(true);
    expect(isWalletRefusal(Error("User declined the request"))).toBe(true);
    expect(isWalletRefusal({ code: 4001, message: "" })).toBe(true);
    // The connector's own error class.
    expect(isWalletRefusal({ code: "USER_REJECTED", message: "" })).toBe(true);
    // The legacy adapter kept the wallet's error as `error`.
    expect(
      isWalletRefusal(
        Object.assign(Error("Unexpected error"), { error: { code: 4001 } }),
      ),
    ).toBe(true);
    expect(isWalletRefusal(Error("Transaction simulation failed"))).toBe(false);
    expect(isWalletRefusal(null)).toBe(false);
  });

  it("looks through wrapped errors", () => {
    const wrapped = Error("Failed to sign transaction", {
      cause: Error("Something", { cause: { code: 4001 } }),
    });
    expect(isWalletRefusal(wrapped)).toBe(true);
    expect(
      isWalletRefusal(Error("Failed", { cause: Error("Simulation failed") })),
    ).toBe(false);
  });
});
