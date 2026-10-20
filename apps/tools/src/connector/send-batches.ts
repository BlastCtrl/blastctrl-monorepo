import { retryWithBackoff } from "@/lib/utils";
import {
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  getSignatureFromTransaction,
  isSolanaError,
  isTransactionModifyingSigner,
  sendAndConfirmTransactionFactory,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  type Instruction,
  type Signature,
  type Transaction,
  type TransactionWithLifetime,
} from "@solana/kit";
import { estimateAndSetResourceLimitsWithBuffer } from "./resource-limits";
import { transactionErrorMessage } from "./transaction-error";
import type { KitClient } from "./use-kit-client";

export type BatchResult =
  | { index: number; status: "confirmed"; signature: Signature }
  | { index: number; status: "failed"; error: string };

export type BatchStage = "signing" | "confirming";

export type BatchCallbacks = {
  onBatchResult: (result: BatchResult) => void;
  /**
   * Where a batch is before its result: waiting on the wallet to approve it,
   * or sent and waiting on the chain to confirm it.
   */
  onStage?: (index: number, stage: BatchStage) => void;
};

/**
 * The wallet turned a request down. A wallet that asks per transaction can
 * do that partway through: `sent` transactions went out before it, and have
 * already reported their results.
 */
export class WalletRefusedError extends Error {
  constructor(
    readonly sent: number,
    readonly of: number,
    cause: unknown,
  ) {
    super(transactionErrorMessage(cause), { cause });
    this.name = "WalletRefusedError";
  }
}

/**
 * Whether the wallet refused rather than failed. Wallets that follow
 * EIP-1193 reject with code 4001, the connector's own errors say
 * `USER_REJECTED`, and the rest are recognised by their message. The wallet's
 * error may arrive wrapped, so the cause chain is checked too.
 */
export function isWalletRefusal(err: unknown): boolean {
  let error: unknown = err;
  for (let depth = 0; error && depth < 5; depth++) {
    const {
      code,
      error: inner,
      message,
    } = error as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
    };
    if (code === 4001 || code === "USER_REJECTED") return true;
    // The legacy adapter kept the wallet's error as `error`.
    if ((inner as { code?: unknown } | null)?.code === 4001) return true;
    if (
      typeof message === "string" &&
      /reject|denied|declined|cancel/i.test(message)
    ) {
      return true;
    }
    error = (error as { cause?: unknown }).cause;
  }
  return false;
}

export type BlockhashLifetime = Parameters<
  typeof setTransactionMessageLifetimeUsingBlockhash
>[0];

/** A compiled transaction, ready for the wallet. */
export type PreparedTransaction = Transaction & TransactionWithLifetime;

/**
 * What sending batches needs from the chain and the wallet. `kitBatchSender`
 * is the real one; tests fake it.
 */
export type BatchSender = {
  latestBlockhash: () => Promise<BlockhashLifetime>;
  /**
   * Plans `instructions` (fee payer, compute limit from a simulation) into a
   * transaction with `lifetime`.
   */
  prepare: (
    instructions: Instruction[],
    lifetime: BlockhashLifetime,
  ) => Promise<PreparedTransaction>;
  /**
   * The wallet signs them all in one prompt, or throws
   * `SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED` for more than one
   * when it can't.
   */
  sign: (
    transactions: PreparedTransaction[],
  ) => Promise<readonly PreparedTransaction[]>;
  sendAndConfirm: (transaction: PreparedTransaction) => Promise<Signature>;
};

/** The kit client's RPC and wallet signer as a {@link BatchSender}. */
export function kitBatchSender(client: KitClient): BatchSender {
  const signer = client.payer;
  if (!isTransactionModifyingSigner(signer)) {
    throw new Error("The connected wallet can't sign transactions");
  }
  const estimateAndSetResourceLimits = estimateAndSetResourceLimitsWithBuffer(
    client.rpc,
  );
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: client.rpc,
    rpcSubscriptions: client.rpcSubscriptions,
  });

  return {
    latestBlockhash: () =>
      retryWithBackoff(
        async () =>
          (
            await client.rpc
              .getLatestBlockhash({ commitment: "confirmed" })
              .send()
          ).value,
      ),
    prepare: async (instructions, lifetime) => {
      const planned = await client.planTransaction(instructions);
      const message = await estimateAndSetResourceLimits(
        setTransactionMessageLifetimeUsingBlockhash(lifetime, planned),
      );
      return compileTransaction(message);
    },
    sign: (transactions) => signer.modifyAndSignTransactions(transactions),
    sendAndConfirm: async (transaction) => {
      assertIsSendableTransaction(transaction);
      assertIsTransactionWithBlockhashLifetime(transaction);
      await sendAndConfirm(transaction, { commitment: "confirmed" });
      return getSignatureFromTransaction(transaction);
    },
  };
}

type Batches<B> = {
  sender: BatchSender;
  /** The instructions of one batch; they must fit one transaction. */
  build: (batch: B) => Instruction[];
};

/**
 * Sends one transaction per batch and reports each batch's own result; one
 * failing doesn't stop the others. A refusal does: it throws
 * `WalletRefusedError` and asks for nothing more. Anything else it throws
 * means nothing was sent.
 *
 * Every batch is planned first, each with its own simulation, so one that
 * can't be planned fails on its own while the rest still go out. The wallet
 * is then asked once for all of them; a wallet that only signs one at a time
 * is asked per batch instead.
 */
export async function sendBatches<B extends { index: number }>(
  batches: B[],
  { sender, build }: Batches<B>,
  { onBatchResult, onStage }: BatchCallbacks,
): Promise<void> {
  if (batches.length === 0) return;
  const fail = (index: number, err: unknown) =>
    onBatchResult({
      index,
      status: "failed",
      error: transactionErrorMessage(err),
    });
  const report = (index: number, promise: Promise<Signature>) =>
    promise.then(
      (signature) => onBatchResult({ index, status: "confirmed", signature }),
      (err: unknown) => fail(index, err),
    );

  // One wallet prompt for everything. The batches share a blockhash, which
  // stays valid for about a minute, so they are all sent right away and
  // confirmed side by side rather than one after another.
  const lifetime = await sender.latestBlockhash();
  const planned = await Promise.allSettled(
    batches.map((batch) => sender.prepare(build(batch), lifetime)),
  );
  const ready: { batch: B; transaction: PreparedTransaction }[] = [];
  planned.forEach((outcome, i) => {
    const batch = batches[i]!;
    if (outcome.status === "fulfilled") {
      ready.push({ batch, transaction: outcome.value });
    } else {
      fail(batch.index, outcome.reason);
    }
  });
  if (ready.length === 0) return;

  ready.forEach(({ batch }) => onStage?.(batch.index, "signing"));
  let signed: readonly PreparedTransaction[];
  try {
    signed = await sender.sign(ready.map((r) => r.transaction));
  } catch (err) {
    if (
      isSolanaError(err, SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED)
    ) {
      await sendOneByOne(
        ready.map((r) => r.batch),
        { sender, build },
        { onBatchResult, onStage },
      );
      return;
    }
    if (isWalletRefusal(err)) {
      throw new WalletRefusedError(0, ready.length, err);
    }
    throw err;
  }

  await Promise.all(
    ready.map(({ batch }, i) => {
      onStage?.(batch.index, "confirming");
      return report(batch.index, sender.sendAndConfirm(signed[i]!));
    }),
  );
}

/**
 * For wallets that ask once per transaction. Each batch gets its own fresh
 * blockhash, since the next prompt waits for the last confirmation. By the
 * time one is turned down, every batch before it has reported.
 */
async function sendOneByOne<B extends { index: number }>(
  batches: B[],
  { sender, build }: Batches<B>,
  { onBatchResult, onStage }: BatchCallbacks,
): Promise<void> {
  const fail = (index: number, err: unknown) =>
    onBatchResult({
      index,
      status: "failed",
      error: transactionErrorMessage(err),
    });

  for (const [sent, batch] of batches.entries()) {
    let lifetime: BlockhashLifetime;
    try {
      lifetime = await sender.latestBlockhash();
    } catch (err) {
      if (sent === 0) throw err;
      // Earlier batches went out, so this isn't "nothing was sent". The RPC
      // is likely down: fail this batch and the rest rather than wait on
      // each in turn.
      batches.slice(sent).forEach((rest) => fail(rest.index, err));
      return;
    }

    let transaction: PreparedTransaction;
    try {
      transaction = await sender.prepare(build(batch), lifetime);
    } catch (err) {
      fail(batch.index, err);
      continue;
    }

    onStage?.(batch.index, "signing");
    let signed: PreparedTransaction;
    try {
      [signed] = (await sender.sign([transaction])) as [PreparedTransaction];
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(sent, batches.length, err);
      }
      fail(batch.index, err);
      continue;
    }

    onStage?.(batch.index, "confirming");
    await sender.sendAndConfirm(signed).then(
      (signature) =>
        onBatchResult({ index: batch.index, status: "confirmed", signature }),
      (err: unknown) => fail(batch.index, err),
    );
  }
}
