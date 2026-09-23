import { createWithdrawExcessLamportsInstruction } from "@/lib/solana/withdraw-excess-lamports";
import { retryWithBackoff } from "@/lib/utils";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import type { ReclaimableAccount } from "./types";

export type BatchResult =
  | { index: number; status: "confirmed"; signature: string }
  | { index: number; status: "failed"; error: string };

type Variables = {
  /** Batches to send, keyed by their index in the dialog's list. */
  batches: { index: number; accounts: ReclaimableAccount[] }[];
};

type Options = {
  onBatchResult: (result: BatchResult) => void;
  onSettled?: () => void;
};

/**
 * Signs and sends one transaction per batch, confirming each in turn. A batch
 * that fails doesn't stop the others: every batch reports its own result.
 * Throws only when nothing was sent, e.g. the wallet rejected signing.
 */
export function useReclaimExcess({ onBatchResult, onSettled }: Options) {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, sendTransaction } = useWallet();

  return useMutation({
    mutationFn: async ({ batches }: Variables) => {
      if (!publicKey) throw Error("Wallet is not connected");

      const { blockhash, lastValidBlockHeight } = await retryWithBackoff(() =>
        connection.getLatestBlockhash("confirmed"),
      );
      const transactions = batches.map(({ accounts }) => {
        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        });
        tx.add(...accounts.map((a) => toInstruction(a, publicKey)));
        return tx;
      });

      // One wallet prompt for everything when the wallet supports it.
      const signed = signAllTransactions
        ? await signAllTransactions(transactions)
        : null;

      for (const [i, { index }] of batches.entries()) {
        try {
          const signature = signed
            ? await connection.sendRawTransaction(signed[i]!.serialize(), {
                preflightCommitment: "confirmed",
                maxRetries: 0,
              })
            : await sendTransaction(transactions[i]!, connection, {
                preflightCommitment: "confirmed",
                maxRetries: 0,
              });

          await confirm(connection, signature, blockhash, lastValidBlockHeight);
          onBatchResult({ index, status: "confirmed", signature });
        } catch (err) {
          onBatchResult({
            index,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    onSettled,
  });
}

function toInstruction(account: ReclaimableAccount, wallet: PublicKey) {
  return createWithdrawExcessLamportsInstruction(
    new PublicKey(account.address),
    wallet,
    wallet,
    [],
    account.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
  );
}

async function confirm(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
) {
  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  }
}
