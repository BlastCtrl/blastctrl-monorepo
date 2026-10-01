import { createWithdrawExcessLamportsInstruction } from "@/lib/solana/withdraw-excess-lamports";
import { retryWithBackoff } from "@/lib/utils";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import type { ServiceFee } from "./fee";
import { SERVICE_FEE, createServiceFeeInstruction } from "./fee";
import type { ReclaimableAccount } from "./types";
import { closes, reclaimLamports } from "./types";

export type BatchResult =
  | { index: number; status: "confirmed"; signature: string }
  | { index: number; status: "failed"; error: string };

export type Batch = { index: number; accounts: ReclaimableAccount[] };

type Variables = {
  /** Batches to send, keyed by their index in the dialog's list. */
  batches: Batch[];
  /** Close the empty token accounts instead of withdrawing their excess. */
  closeEmpty: boolean;
};

type Options = {
  onBatchResult: (result: BatchResult) => void;
  /**
   * Where a batch is before its result: waiting on the wallet to approve it,
   * or sent and waiting on the chain to confirm it.
   */
  onStage?: (index: number, stage: "signing" | "confirming") => void;
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
    super(errorMessage(cause), { cause });
    this.name = "WalletRefusedError";
  }
}

/**
 * Whether the wallet refused rather than failed. Wallets that follow
 * EIP-1193 reject with code 4001, which the adapter keeps on its own error
 * as `error`; the rest are recognised by their message.
 */
export function isWalletRefusal(err: unknown) {
  const inner = (err as { error?: unknown } | null)?.error;
  if ([err, inner].some((e) => (e as { code?: unknown })?.code === 4001)) {
    return true;
  }
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

type Sender = {
  connection: Connection;
  wallet: Pick<WalletContextState, "signAllTransactions" | "sendTransaction">;
  build: (batch: Batch, lifetime: Lifetime) => Transaction;
};

/**
 * Sends one transaction per batch and reports each batch's own result; one
 * failing doesn't stop the others. A refusal does: it throws
 * `WalletRefusedError` and asks for nothing more. Anything else it throws
 * means nothing was sent.
 */
export async function sendBatches(
  batches: Batch[],
  { connection, wallet, build }: Sender,
  { onBatchResult, onStage }: Pick<Options, "onBatchResult" | "onStage">,
) {
  const report = (index: number, promise: Promise<string>) =>
    promise.then(
      (signature) => onBatchResult({ index, status: "confirmed", signature }),
      (err: unknown) =>
        onBatchResult({ index, status: "failed", error: errorMessage(err) }),
    );

  if (wallet.signAllTransactions) {
    // One wallet prompt for everything. The batches share a blockhash,
    // which stays valid for about a minute, so they are all sent right
    // away and confirmed side by side rather than one after another.
    const lifetime = await latestBlockhash(connection);
    batches.forEach(({ index }) => onStage?.(index, "signing"));
    let signed: Transaction[];
    try {
      signed = await wallet.signAllTransactions(
        batches.map((b) => build(b, lifetime)),
      );
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(0, batches.length, err);
      }
      throw err;
    }
    await Promise.all(
      batches.map(({ index }, i) =>
        report(
          index,
          connection
            .sendRawTransaction(signed[i]!.serialize(), SEND_OPTIONS)
            .then((signature) => {
              onStage?.(index, "confirming");
              return confirm(connection, signature, lifetime);
            }),
        ),
      ),
    );
    return;
  }

  // Wallets without signAllTransactions prompt once per batch, so each
  // batch gets its own fresh blockhash. The next prompt waits for the last
  // confirmation, so by the time one is turned down, every batch before it
  // has reported.
  for (const [sent, batch] of batches.entries()) {
    const lifetime = await latestBlockhash(connection);
    onStage?.(batch.index, "signing");
    let signature: string;
    try {
      signature = await wallet.sendTransaction(
        build(batch, lifetime),
        connection,
        SEND_OPTIONS,
      );
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(sent, batches.length, err);
      }
      onBatchResult({
        index: batch.index,
        status: "failed",
        error: errorMessage(err),
      });
      continue;
    }
    onStage?.(batch.index, "confirming");
    await report(batch.index, confirm(connection, signature, lifetime));
  }
}

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const SEND_OPTIONS = {
  preflightCommitment: "confirmed",
  maxRetries: 0,
} as const;

type Lifetime = { blockhash: string; lastValidBlockHeight: number };

const latestBlockhash = (connection: Connection) =>
  retryWithBackoff(() => connection.getLatestBlockhash("confirmed"));

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
    const reclaimed = accounts.reduce(
      (sum, a) => sum + reclaimLamports(a, closeEmpty),
      0,
    );
    const transfer = createServiceFeeInstruction(wallet, reclaimed, fee);
    if (transfer) tx.add(transfer);
  }
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
