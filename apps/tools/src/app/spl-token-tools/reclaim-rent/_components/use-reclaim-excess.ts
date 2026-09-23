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

type Batch = { index: number; accounts: ReclaimableAccount[] };

type Variables = {
  /** Batches to send, keyed by their index in the dialog's list. */
  batches: Batch[];
};

type Options = {
  onBatchResult: (result: BatchResult) => void;
  onSettled?: () => void;
};

/**
 * Sends one transaction per batch and reports each batch's own result; one
 * failing doesn't stop the others. Throws only when nothing was sent, e.g.
 * the wallet rejected signing.
 */
export function useReclaimExcess({ onBatchResult, onSettled }: Options) {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, sendTransaction } = useWallet();

  return useMutation({
    mutationFn: async ({ batches }: Variables) => {
      if (!publicKey) throw Error("Wallet is not connected");

      const report = (index: number, promise: Promise<string>) =>
        promise.then(
          (signature) =>
            onBatchResult({ index, status: "confirmed", signature }),
          (err: unknown) =>
            onBatchResult({
              index,
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            }),
        );

      if (signAllTransactions) {
        // One wallet prompt for everything. The batches share a blockhash,
        // which stays valid for about a minute, so they are all sent right
        // away and confirmed side by side rather than one after another.
        const lifetime = await latestBlockhash(connection);
        const signed = await signAllTransactions(
          batches.map((b) => build(b, publicKey, lifetime)),
        );
        await Promise.all(
          batches.map(({ index }, i) =>
            report(
              index,
              connection
                .sendRawTransaction(signed[i]!.serialize(), SEND_OPTIONS)
                .then((signature) => confirm(connection, signature, lifetime)),
            ),
          ),
        );
        return;
      }

      // Wallets without signAllTransactions prompt once per batch, so each
      // batch gets its own fresh blockhash.
      for (const batch of batches) {
        const lifetime = await latestBlockhash(connection);
        await report(
          batch.index,
          sendTransaction(
            build(batch, publicKey, lifetime),
            connection,
            SEND_OPTIONS,
          ).then((signature) => confirm(connection, signature, lifetime)),
        );
      }
    },
    onSettled,
  });
}

const SEND_OPTIONS = {
  preflightCommitment: "confirmed",
  maxRetries: 0,
} as const;

type Lifetime = { blockhash: string; lastValidBlockHeight: number };

const latestBlockhash = (connection: Connection) =>
  retryWithBackoff(() => connection.getLatestBlockhash("confirmed"));

function build(batch: Batch, wallet: PublicKey, lifetime: Lifetime) {
  const tx = new Transaction({ feePayer: wallet, ...lifetime });
  tx.add(
    ...batch.accounts.map((account) =>
      createWithdrawExcessLamportsInstruction(
        new PublicKey(account.address),
        wallet,
        wallet,
        [],
        account.program === "token-2022"
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID,
      ),
    ),
  );
  return tx;
}

async function confirm(
  connection: Connection,
  signature: string,
  lifetime: Lifetime,
) {
  const result = await connection.confirmTransaction(
    { signature, ...lifetime },
    "confirmed",
  );
  if (result.value.err) {
    throw Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  }
  return signature;
}
