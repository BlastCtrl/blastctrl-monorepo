import {
  kitBatchSender,
  sendBatches,
  type BatchCallbacks,
} from "@/connector/send-batches";
import { useKitClient, type KitClient } from "@/connector/use-kit-client";
import { useMutation } from "@tanstack/react-query";
import { SERVICE_FEE } from "./fee";
import { buildReclaimInstructions } from "./reclaim-instructions";
import type { ReclaimableAccount } from "./types";

export type Batch = { index: number; accounts: ReclaimableAccount[] };

type Variables = {
  /** Batches to send, keyed by their index in the dialog's list. */
  batches: Batch[];
  /** Close the empty token accounts instead of withdrawing their excess. */
  closeEmpty: boolean;
};

type Options = BatchCallbacks & {
  onSettled?: () => void;
};

/** Sends the batches through the kit client's wallet; see `sendBatches`. */
export function useReclaimExcess({
  onBatchResult,
  onStage,
  onSettled,
}: Options) {
  const { client } = useKitClient();

  return useMutation({
    mutationFn: async (variables: Variables) => {
      if (!client) throw Error("Wallet is not connected");
      await sendReclaimBatches(client, variables, { onBatchResult, onStage });
    },
    onSettled,
  });
}

/**
 * What the mutation does, outside React: each batch's closes and withdrawals
 * plus the service fee, sent through `sendBatches` in one wallet prompt.
 */
async function sendReclaimBatches(
  client: KitClient,
  { batches, closeEmpty }: Variables,
  callbacks: BatchCallbacks,
): Promise<void> {
  await sendBatches(
    batches,
    {
      sender: kitBatchSender(client),
      build: (batch) =>
        buildReclaimInstructions(
          batch.accounts,
          client.payer,
          SERVICE_FEE,
          closeEmpty,
        ),
    },
    callbacks,
  );
}
