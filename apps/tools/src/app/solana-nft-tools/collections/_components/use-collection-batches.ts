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
import type { Address, Instruction, Signature } from "@solana/kit";
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
 * `build`, in one wallet prompt, and keeps every transaction's progress for
 * the status list. `send` resolves with the final list and throws what
 * `sendBatches` throws: a refusal, or an error meaning nothing was sent.
 */
export function useCollectionBatches(
  build: (wallet: Address, item: CollectionItem) => Instruction[],
  perTransaction: number,
) {
  const [batches, setBatches] = useState<CollectionBatch[] | null>(null);

  const send = async (client: KitClient, items: CollectionItem[]) => {
    const groups = chunk(items, perTransaction);
    const current: CollectionBatch[] = groups.map((items) => ({
      items,
      status: "waiting",
    }));
    const update = (index: number, patch: Partial<CollectionBatch>) => {
      current[index] = { ...current[index]!, ...patch };
      setBatches([...current]);
    };
    setBatches([...current]);

    try {
      await sendBatches(
        groups.map((items, index) => ({ index, items })),
        {
          sender: kitBatchSender(client),
          build: (batch) =>
            batch.items.flatMap((item) => build(client.payer.address, item)),
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
  };

  return { batches, send, reset: () => setBatches(null) };
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
