import {
  kitBatchSender,
  sendBatches,
  type BatchCallbacks,
} from "@/connector/send-batches";
import { useKitClient } from "@/connector/use-kit-client";
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
    mutationFn: async ({ batches, closeEmpty }: Variables) => {
      if (!client) throw Error("Wallet is not connected");
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
        { onBatchResult, onStage },
      );
    },
    onSettled,
  });
}
