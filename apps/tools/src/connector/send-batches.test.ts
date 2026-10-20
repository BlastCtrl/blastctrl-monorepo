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
  sendInOrder,
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

describe("sendBatches with a wallet that signs only the first of a batch", () => {
  /** Signs the first transaction it is given; its `n`th prompt throws `error`. */
  const firstOnlyWallet = (n = 0, error = Error("unused")) => {
    const state = { prompts: 0 };
    const sign: BatchSender["sign"] = async (transactions) => {
      state.prompts++;
      if (state.prompts === n) throw error;
      return transactions.slice(0, 1);
    };
    return { state, sign };
  };

  it("sends what came back and asks one at a time for the rest", async () => {
    const wallet = firstOnlyWallet();
    const { outcome, results, stages } = await run(
      senderWith({ sign: wallet.sign }),
    );
    expect(outcome).toBeUndefined();
    expect(wallet.state.prompts).toBe(5);
    expect(results.map((r) => r.status)).toEqual(Array(5).fill("confirmed"));
    // Batch 0 was in the one that came back; the others each got a prompt.
    expect(stages.slice(0, 6)).toEqual([
      ...batches.map((b) => `${b.index}:signing`),
      "0:confirming",
    ]);
  });

  it("counts the one that went out when a later prompt is refused", async () => {
    const wallet = firstOnlyWallet(3, Error("User rejected the request."));
    const { outcome, results } = await run(senderWith({ sign: wallet.sign }));
    expect(outcome).toBeInstanceOf(WalletRefusedError);
    expect(outcome).toMatchObject({ sent: 2, of: 5 });
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
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

describe("sendInOrder", () => {
  /** Five steps; step `i` has `i + 1` instructions so `prepare` can tell them apart. */
  const steps = batches.map((b) => Array<Instruction>(b.index + 1).fill(noop));

  const runInOrder = async (sender: BatchSender) => {
    const progress: number[] = [];
    const outcome = await sendInOrder(steps, sender, (confirmed) =>
      progress.push(confirmed),
    ).then(
      (signatures) => ({ signatures, err: undefined }),
      (err: unknown) => ({ signatures: undefined, err }),
    );
    return { ...outcome, progress };
  };

  it("asks once, then confirms one after another", async () => {
    const prompts: number[] = [];
    let inFlight = 0;
    let overlapped = false;
    const { signatures, progress } = await runInOrder(
      senderWith({
        sign: async (transactions) => {
          prompts.push(transactions.length);
          return transactions;
        },
        sendAndConfirm: async (transaction) => {
          if (inFlight++ > 0) overlapped = true;
          await Promise.resolve();
          inFlight--;
          return `signature-${transaction.messageBytes[0]}` as Signature;
        },
      }),
    );
    expect(prompts).toEqual([5]);
    expect(overlapped).toBe(false);
    expect(signatures).toEqual([1, 2, 3, 4, 5].map((n) => `signature-${n}`));
    expect(progress).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("stops at the first failure, keeping what confirmed", async () => {
    let sent = 0;
    const { err, progress } = await runInOrder(
      senderWith({
        sendAndConfirm: async () => {
          if (++sent === 3) throw Error("Transaction failed");
          return `signature-${sent}` as Signature;
        },
      }),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WalletRefusedError);
    expect(sent).toBe(3);
    expect(progress).toEqual([0, 1, 2]);
  });

  it("asks per step when the wallet can't batch, and says how far it got when refused", async () => {
    const wallet = perTransactionWallet(3, Error("User rejected the request."));
    const { err, progress } = await runInOrder(
      senderWith({ sign: wallet.sign }),
    );
    expect(err).toBeInstanceOf(WalletRefusedError);
    expect(err).toMatchObject({ sent: 2, of: 5 });
    expect(progress).toEqual([0, 1, 2]);
  });

  it("asks for the rest one at a time when fewer come back", async () => {
    let prompts = 0;
    const { signatures } = await runInOrder(
      senderWith({
        sign: async (transactions) => {
          prompts++;
          return transactions.slice(0, 1);
        },
      }),
    );
    expect(prompts).toBe(5);
    expect(signatures).toHaveLength(5);
  });
});
