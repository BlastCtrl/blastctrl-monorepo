import { retryWithBackoff } from "@/lib/utils";
import { sendAndConfirmWithSlotFactory } from "@blastctrl/kit-extensions";
import {
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  isSolanaError,
  isTransactionModifyingSigner,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
  type Instruction,
  type Signature,
  type Slot,
  type Transaction,
  type TransactionWithLifetime,
} from "@solana/kit";
import { retryWhileBehind } from "./min-context-slot";
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

/** A confirmed transaction and the slot its confirmation was seen at. */
export type Confirmed = { signature: Signature; slot: Slot };

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
  /**
   * Sends, waits for confirmation and reports the slot it came at. With
   * `minContextSlot`, an RPC node that hasn't reached that slot refuses the
   * send instead of simulating it against an older state.
   */
  sendAndConfirm: (
    transaction: PreparedTransaction,
    minContextSlot?: Slot,
  ) => Promise<Confirmed>;
};

export type BatchSenderOptions = {
  /**
   * Sets this compute unit limit instead of simulating for one. For
   * transactions that depend on each other: a simulation of one fails until
   * the one before it has landed. {@link runtimeDefaultComputeUnits} is what
   * a transaction gets with no limit of its own.
   */
  computeUnitLimit?: (instructions: Instruction[]) => number;
};

/** The budget the runtime gives a transaction that sets none: 200,000 per instruction, up to the cap. */
export const runtimeDefaultComputeUnits = (instructions: Instruction[]) =>
  Math.min(1_400_000, 200_000 * instructions.length);

/** The kit client's RPC and wallet signer as a {@link BatchSender}. */
export function kitBatchSender(
  client: KitClient,
  { computeUnitLimit }: BatchSenderOptions = {},
): BatchSender {
  const signer = client.payer;
  if (!isTransactionModifyingSigner(signer)) {
    throw new Error("The connected wallet can't sign transactions");
  }
  const estimateAndSetResourceLimits = estimateAndSetResourceLimitsWithBuffer(
    client.rpc,
  );
  const sendAndConfirm = sendAndConfirmWithSlotFactory({
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
      const planned = setTransactionMessageLifetimeUsingBlockhash(
        lifetime,
        await client.planTransaction(instructions),
      );
      const message = computeUnitLimit
        ? setTransactionMessageComputeUnitLimit(
            computeUnitLimit(instructions),
            planned,
          )
        : await estimateAndSetResourceLimits(planned);
      return compileTransaction(message);
    },
    sign: (transactions) => signer.modifyAndSignTransactions(transactions),
    sendAndConfirm: async (transaction, minContextSlot) => {
      assertIsSendableTransaction(transaction);
      assertIsTransactionWithBlockhashLifetime(transaction);
      return sendAndConfirm(transaction, {
        commitment: "confirmed",
        minContextSlot,
      });
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
  callbacks: BatchCallbacks,
): Promise<void> {
  const { onBatchResult, onStage } = callbacks;
  if (batches.length === 0) return;
  const fail = (index: number, err: unknown) =>
    onBatchResult({
      index,
      status: "failed",
      error: transactionErrorMessage(err),
    });
  const report = (index: number, promise: Promise<Confirmed>) =>
    promise.then(
      ({ signature }) =>
        onBatchResult({ index, status: "confirmed", signature }),
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
        callbacks,
      );
      return;
    }
    if (isWalletRefusal(err)) {
      throw new WalletRefusedError(0, ready.length, err);
    }
    throw err;
  }

  // A wallet may hand back fewer than it was given (some stop at the first).
  // Those go out; the rest are asked for one at a time, counted on from
  // here so a refusal still says how far the whole run got.
  const signedCount = Math.min(signed.length, ready.length);
  const sending = Promise.all(
    ready.slice(0, signedCount).map(({ batch }, i) => {
      onStage?.(batch.index, "confirming");
      return report(batch.index, sender.sendAndConfirm(signed[i]!));
    }),
  );
  const rest = ready.slice(signedCount).map((r) => r.batch);
  try {
    if (rest.length > 0) {
      await sendOneByOne(rest, { sender, build }, callbacks, signedCount);
    }
  } finally {
    await sending;
  }
}

/**
 * For wallets that ask once per transaction. Each batch gets its own fresh
 * blockhash, since the next prompt waits for the last confirmation. By the
 * time one is turned down, every batch before it has reported. `sentBefore`
 * is how many went out before this run, in one prompt.
 */
async function sendOneByOne<B extends { index: number }>(
  batches: B[],
  { sender, build }: Batches<B>,
  { onBatchResult, onStage }: BatchCallbacks,
  sentBefore = 0,
): Promise<void> {
  const fail = (index: number, err: unknown) =>
    onBatchResult({
      index,
      status: "failed",
      error: transactionErrorMessage(err),
    });

  for (const [i, batch] of batches.entries()) {
    const sent = sentBefore + i;
    let lifetime: BlockhashLifetime;
    try {
      lifetime = await sender.latestBlockhash();
    } catch (err) {
      if (sent === 0) throw err;
      // Earlier batches went out, so this isn't "nothing was sent". The RPC
      // is likely down: fail this batch and the rest rather than wait on
      // each in turn.
      batches.slice(i).forEach((rest) => fail(rest.index, err));
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
        throw new WalletRefusedError(sent, sentBefore + batches.length, err);
      }
      fail(batch.index, err);
      continue;
    }

    onStage?.(batch.index, "confirming");
    await sender.sendAndConfirm(signed).then(
      ({ signature }) =>
        onBatchResult({ index: batch.index, status: "confirmed", signature }),
      (err: unknown) => fail(batch.index, err),
    );
  }
}

/**
 * Called before the first send and after each confirmation, with the count
 * so far and the slot the latest confirmation came at.
 */
export type OrderProgress = (
  confirmed: number,
  total: number,
  slot?: Slot,
) => void;

/**
 * Sends transactions that depend on each other, in order: each is confirmed
 * before the next goes out, and the first failure stops the rest. The wallet
 * is asked once for all of them, or per transaction when it can't do that,
 * like {@link sendBatches}. Reports each confirmation and resolves with the
 * signatures. A refusal throws `WalletRefusedError`.
 *
 * The sender must not simulate, since a step's accounts may not exist until
 * the step before it lands: use `kitBatchSender(client, { computeUnitLimit })`.
 */
export async function sendInOrder(
  steps: Instruction[][],
  sender: BatchSender,
  onProgress?: OrderProgress,
): Promise<Signature[]> {
  const signatures: Signature[] = [];
  onProgress?.(0, steps.length);
  if (steps.length === 0) return signatures;

  const lifetime = await sender.latestBlockhash();
  const transactions = await Promise.all(
    steps.map((step) => sender.prepare(step, lifetime)),
  );
  let signed: readonly PreparedTransaction[];
  try {
    signed = await sender.sign(transactions);
  } catch (err) {
    if (
      isSolanaError(err, SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED)
    ) {
      return sendRestInOrder(steps, sender, signatures, undefined, onProgress);
    }
    if (isWalletRefusal(err)) {
      throw new WalletRefusedError(0, steps.length, err);
    }
    throw err;
  }

  let last: Slot | undefined;
  for (const transaction of signed.slice(0, steps.length)) {
    const { signature, slot } = await sendAndConfirmStep(
      sender,
      transaction,
      last,
    );
    last = slot;
    signatures.push(signature);
    onProgress?.(signatures.length, steps.length, slot);
  }
  // A wallet may hand back fewer than it was given; the rest are asked for
  // one at a time.
  return sendRestInOrder(steps, sender, signatures, last, onProgress);
}

/**
 * The steps after `signatures.length`, each with its own prompt and
 * blockhash; `last` is the slot the previous step confirmed at, if any.
 */
async function sendRestInOrder(
  steps: Instruction[][],
  sender: BatchSender,
  signatures: Signature[],
  last: Slot | undefined,
  onProgress?: OrderProgress,
): Promise<Signature[]> {
  for (const step of steps.slice(signatures.length)) {
    const transaction = await sender.prepare(
      step,
      await sender.latestBlockhash(),
    );
    let signed: PreparedTransaction;
    try {
      [signed] = (await sender.sign([transaction])) as [PreparedTransaction];
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(signatures.length, steps.length, err);
      }
      throw err;
    }
    const { signature, slot } = await sendAndConfirmStep(sender, signed, last);
    last = slot;
    signatures.push(signature);
    onProgress?.(signatures.length, steps.length, slot);
  }
  return signatures;
}

/**
 * `sender.sendAndConfirm` for one step, which needs the step before it,
 * confirmed at `after`, to be visible: the RPC may confirm from one node
 * and send through another a slot or two behind, where the accounts the
 * earlier step made don't exist yet. The send names `after` as its minimum
 * context slot, so such a node refuses it outright instead of simulating
 * it against the older state, and it is tried again until a node that has
 * caught up takes it.
 */
const sendAndConfirmStep = (
  sender: BatchSender,
  transaction: PreparedTransaction,
  after: Slot | undefined,
): Promise<Confirmed> =>
  retryWhileBehind(() => sender.sendAndConfirm(transaction, after));
