import { notify } from "@/components";
import {
  kitBatchSender,
  sendBatches,
  WalletRefusedError,
  type BatchStage,
} from "@/connector/send-batches";
import { transactionErrorMessage } from "@/connector/transaction-error";
import type { KitClient } from "@/connector/use-kit-client";
import { chunk } from "@/lib/utils";
import type { Instruction, Signature, TransactionSigner } from "@solana/kit";
import { useState } from "react";
import type { CollectionItem } from "./collection-plan";

export type CollectionBatch = {
  items: CollectionItem[];
  status: "waiting" | BatchStage | "confirmed" | "failed";
  signature?: Signature;
  error?: string;
};

/**
 * Sends `items` as transactions of `perTransaction`, each built with
 * `build` and the wallet's signer, in one wallet prompt, and keeps every
 * transaction's progress for the status list. `send` resolves with the final
 * list and throws what `sendBatches` throws: a refusal, or an error meaning
 * nothing was sent.
 */
export function useCollectionBatches(
  build: (
    wallet: TransactionSigner,
    item: CollectionItem,
  ) => Promise<Instruction[]>,
  perTransaction: number,
) {
  const [batches, setBatches] = useState<CollectionBatch[] | null>(null);

  const send = (client: KitClient, items: CollectionItem[]) =>
    sendCollectionBatches(client, items, build, perTransaction, setBatches);

  return { batches, send, reset: () => setBatches(null) };
}

/** The body of `useCollectionBatches`' `send`; `onChange` gets each new list. */
async function sendCollectionBatches(
  client: KitClient,
  items: CollectionItem[],
  build: (
    wallet: TransactionSigner,
    item: CollectionItem,
  ) => Promise<Instruction[]>,
  perTransaction: number,
  onChange: (batches: CollectionBatch[]) => void,
): Promise<CollectionBatch[]> {
  const groups = chunk(items, perTransaction);
  // Built up front: deriving the PDAs is async, `sendBatches` builds sync.
  const instructions = await Promise.all(
    groups.map(async (group) =>
      (
        await Promise.all(group.map((item) => build(client.payer, item)))
      ).flat(),
    ),
  );
  const current: CollectionBatch[] = groups.map((items) => ({
    items,
    status: "waiting",
  }));
  const update = (index: number, patch: Partial<CollectionBatch>) => {
    current[index] = { ...current[index]!, ...patch };
    onChange([...current]);
  };
  onChange([...current]);

  try {
    await sendBatches(
      groups.map((items, index) => ({ index, items })),
      {
        sender: kitBatchSender(client),
        build: (batch) => instructions[batch.index]!,
      },
      {
        onStage: (index, stage) => update(index, { status: stage }),
        onBatchResult: (result) =>
          update(
            result.index,
            result.status === "confirmed"
              ? { status: "confirmed", signature: result.signature }
              : { status: "failed", error: result.error },
          ),
      },
    );
  } catch (err) {
    // Whatever hasn't reported by now was never sent.
    current.forEach((batch, index) => {
      if (batch.status !== "confirmed" && batch.status !== "failed") {
        update(index, { status: "failed", error: "Not sent" });
      }
    });
    throw err;
  }
  return current;
}

/** How many of the items in `batches` confirmed. */
export const confirmedItems = (batches: CollectionBatch[]) =>
  batches
    .filter((batch) => batch.status === "confirmed")
    .reduce((count, batch) => count + batch.items.length, 0);

/** The toast for what `send`, or the planning before it, throws. */
export function notifySendFailure(err: unknown, title: string) {
  if (err instanceof WalletRefusedError) {
    notify({
      type: "error",
      title:
        err.sent > 0
          ? `Stopped after ${err.sent} of ${err.of} transactions`
          : "Nothing was sent",
      description: err.message,
    });
  } else {
    notify({ type: "error", title, description: transactionErrorMessage(err) });
  }
}
