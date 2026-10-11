import { createWithdrawExcessLamportsInstruction } from "@/lib/solana/withdraw-excess-lamports";
import type { BatchCallbacks, Lifetime } from "@/lib/solana/send-batches";
import { sendBatches } from "@/lib/solana/send-batches";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import type { ServiceFee } from "./fee";
import { SERVICE_FEE, createServiceFeeInstruction } from "./fee";
import type { ReclaimableAccount } from "./types";
import { closes, feeBase } from "./types";

export type { BatchResult } from "@/lib/solana/send-batches";
export {
  WalletRefusedError,
  isWalletRefusal,
  sendBatches,
} from "@/lib/solana/send-batches";

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

/**
 * Sends the batches through the wallet adapter's connection and wallet; see
 * `sendBatches`.
 */
export function useReclaimExcess({
  onBatchResult,
  onStage,
  onSettled,
}: Options) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;

  return useMutation({
    mutationFn: async ({ batches, closeEmpty }: Variables) => {
      if (!publicKey) throw Error("Wallet is not connected");
      await sendBatches(
        batches,
        {
          connection,
          wallet,
          build: (batch, lifetime) =>
            buildReclaimTransaction(
              batch.accounts,
              publicKey,
              lifetime,
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

/**
 * One instruction per account (closing it, or withdrawing its excess), then
 * the service fee if there is one. Both instructions take the same three
 * accounts and a one-byte payload, so a batch is the same size either way.
 */
export function buildReclaimTransaction(
  accounts: ReclaimableAccount[],
  wallet: PublicKey,
  lifetime: Lifetime,
  fee: ServiceFee | null,
  closeEmpty: boolean,
) {
  const tx = new Transaction({ feePayer: wallet, ...lifetime });
  tx.add(
    ...accounts.map((account) => {
      const instruction = closes(account, closeEmpty)
        ? createCloseAccountInstruction
        : createWithdrawExcessLamportsInstruction;
      return instruction(
        new PublicKey(account.address),
        wallet,
        wallet,
        [],
        account.program === "token-2022"
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID,
      );
    }),
  );
  if (fee) {
    const transfer = createServiceFeeInstruction(
      wallet,
      feeBase(accounts),
      fee,
    );
    if (transfer) tx.add(transfer);
  }
  return tx;
}
