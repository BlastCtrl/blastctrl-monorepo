import { chainForEndpoint } from "@/lib/solana/endpoints";
import { retryWithBackoff } from "@/lib/utils";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { Connection, TransactionInstruction } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";

export type BatchResult =
  | { index: number; status: "confirmed"; signature: string }
  | { index: number; status: "failed"; error: string };

export type BatchStage = "signing" | "confirming";

export type Lifetime = { blockhash: string; lastValidBlockHeight: number };

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
  return (
    err instanceof Error && /reject|denied|declined|cancel/i.test(err.message)
  );
}

type Sender<B> = {
  connection: Connection;
  wallet: Pick<WalletContextState, "signAllTransactions" | "sendTransaction"> &
    Partial<Pick<WalletContextState, "wallet" | "publicKey">>;
  build: (batch: B, lifetime: Lifetime) => Transaction;
};

/**
 * Sends one transaction per batch and reports each batch's own result; one
 * failing doesn't stop the others. A refusal does: it throws
 * `WalletRefusedError` and asks for nothing more. Anything else it throws
 * means nothing was sent.
 */
export async function sendBatches<B extends { index: number }>(
  batches: B[],
  { connection, wallet, build }: Sender<B>,
  { onBatchResult, onStage }: BatchCallbacks,
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
      const transactions = batches.map((b) => build(b, lifetime));
      signed =
        (await signWithChain(wallet, transactions, connection.rpcEndpoint)) ??
        (await wallet.signAllTransactions(transactions));
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
    let lifetime: Lifetime;
    try {
      lifetime = await latestBlockhash(connection);
    } catch (err) {
      if (sent === 0) throw err;
      // Earlier batches went out, so this isn't "nothing was sent". The RPC
      // is likely down: fail this batch and the rest rather than wait on
      // each in turn.
      for (const rest of batches.slice(sent)) {
        onBatchResult({
          index: rest.index,
          status: "failed",
          error: errorMessage(err),
        });
      }
      return;
    }
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

/**
 * Sends transactions that depend on each other, in order: each is
 * confirmed before the next goes out, and the first failure stops the rest.
 * Wallets that can sign everything at once are asked once, and the
 * transactions share that blockhash; others are asked per transaction.
 * Reports how many have confirmed so far. A refusal throws
 * `WalletRefusedError` like `sendBatches`.
 */
export async function sendInOrder(
  steps: TransactionInstruction[][],
  { connection, wallet }: Omit<Sender<never>, "build">,
  onProgress?: (confirmed: number, total: number) => void,
) {
  const { publicKey } = wallet;
  if (!publicKey) throw Error("Wallet is not connected");
  const build = (instructions: TransactionInstruction[], lifetime: Lifetime) =>
    new Transaction({ feePayer: publicKey, ...lifetime }).add(...instructions);
  const signatures: string[] = [];
  onProgress?.(0, steps.length);

  if (wallet.signAllTransactions) {
    const lifetime = await latestBlockhash(connection);
    const transactions = steps.map((step) => build(step, lifetime));
    let signed: Transaction[];
    try {
      signed =
        (await signWithChain(wallet, transactions, connection.rpcEndpoint)) ??
        (await wallet.signAllTransactions(transactions));
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(0, steps.length, err);
      }
      throw err;
    }
    for (const transaction of signed) {
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        SEND_OPTIONS,
      );
      signatures.push(await confirm(connection, signature, lifetime));
      onProgress?.(signatures.length, steps.length);
    }
    return signatures;
  }

  for (const step of steps) {
    const lifetime = await latestBlockhash(connection);
    let signature: string;
    try {
      signature = await wallet.sendTransaction(
        build(step, lifetime),
        connection,
        SEND_OPTIONS,
      );
    } catch (err) {
      if (isWalletRefusal(err)) {
        throw new WalletRefusedError(signatures.length, steps.length, err);
      }
      throw err;
    }
    signatures.push(await confirm(connection, signature, lifetime));
    onProgress?.(signatures.length, steps.length);
  }
  return signatures;
}

type StandardAccount = { address: string; chains: readonly string[] };

type StandardSignTransaction = {
  signTransaction: (
    ...inputs: {
      account: StandardAccount;
      chain: string;
      transaction: Uint8Array;
    }[]
  ) => Promise<{ signedTransaction: Uint8Array }[]>;
};

/**
 * Signs through the Wallet Standard feature behind the adapter, which takes
 * the chain the transactions are for. The adapter's own signAllTransactions
 * leaves it out, and Phantom then takes devnet transactions for mainnet ones
 * and warns about a network mismatch. Null when the wallet isn't a Wallet
 * Standard wallet that can sign for that chain; the caller then uses the
 * adapter.
 */
async function signWithChain(
  { wallet, publicKey }: Sender<never>["wallet"],
  transactions: Transaction[],
  endpoint: string,
): Promise<Transaction[] | null> {
  const standard = (
    wallet?.adapter as
      | {
          wallet?: {
            accounts?: readonly StandardAccount[];
            features?: Record<string, unknown>;
          };
        }
      | undefined
  )?.wallet;
  const feature = standard?.features?.["solana:signTransaction"] as
    StandardSignTransaction | undefined;
  if (!feature) return null;
  const chain = chainForEndpoint(endpoint);
  const account = standard?.accounts?.find(
    (a) => a.address === publicKey?.toBase58(),
  );
  if (!account?.chains.includes(chain)) return null;

  const outputs = await feature.signTransaction(
    ...transactions.map((transaction) => ({
      account,
      chain,
      transaction: transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    })),
  );
  return outputs.map(({ signedTransaction }) =>
    Transaction.from(signedTransaction),
  );
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const SEND_OPTIONS = {
  preflightCommitment: "confirmed",
  maxRetries: 0,
} as const;

const latestBlockhash = (connection: Connection) =>
  retryWithBackoff(() => connection.getLatestBlockhash("confirmed"));

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
