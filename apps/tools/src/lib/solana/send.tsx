import { sleep } from "@/lib/utils";
import type {
  BlockheightBasedTransactionConfirmationStrategy,
  Commitment,
  Connection,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import { TransactionExpiredBlockheightExceededError } from "@solana/web3.js";

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

const DEFAULT_TIMEOUT = 20000;

export async function sendSignedTransaction({
  signedTransaction,
  connection,
  blockhash,
  lastValidBlockHeight,
  slot,
  sendingMessage = "Sending transaction...",
  successMessage = "Transaction confirmed",
  timeout = DEFAULT_TIMEOUT,
}: {
  signedTransaction: Transaction | VersionedTransaction;
  connection: Connection;
  blockhash: string;
  lastValidBlockHeight: number;
  slot: number;
  sendingMessage?: string;
  sentMessage?: string;
  successMessage?: string;
  timeout?: number;
}): Promise<string> {
  const rawTransaction = signedTransaction.serialize();
  const startTime = getUnixTs();
  console.log(sendingMessage);
  const txid: TransactionSignature = await connection.sendRawTransaction(
    rawTransaction,
    {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      minContextSlot: slot,
      maxRetries: 0,
    },
  );

  console.log("Started awaiting confirmation for", txid);

  let done = false;
  void (async () => {
    let attemptCounter = 1;
    // sends transactions again in a 20 second window
    while (!done && getUnixTs() - startTime < timeout) {
      void connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        minContextSlot: slot,
      });
      const delayMs = Math.max(attemptCounter ** 2 * 250, 300);
      await sleep(delayMs);
      attemptCounter++;
    }
  })();

  try {
    const strategy: BlockheightBasedTransactionConfirmationStrategy = {
      blockhash,
      lastValidBlockHeight,
      signature: txid,
    };
    const result = await connection.confirmTransaction(strategy, "confirmed");
    if (result.value.err) {
      throw Error(JSON.stringify(result.value.err));
    }
  } catch (err: any) {
    console.error(err);
    if (err instanceof TransactionExpiredBlockheightExceededError) {
      console.log("Timed out awaiting confirmation on transaction");
      throw new Error("Timed out awaiting confirmation on transaction");
    }

    let simulateResult: SimulatedTransactionResponse | null = null;
    try {
      simulateResult = (
        await simulateTransaction(connection, signedTransaction, "single")
      ).value;
    } catch (e) {
      console.error("Simulation error");
    }

    if (simulateResult?.err) {
      if (simulateResult.logs) {
        for (let i = simulateResult.logs.length - 1; i >= 0; --i) {
          const line = simulateResult.logs[i];
          if (line?.startsWith("Program log: ")) {
            throw new Error(
              "Transaction failed: " + line.slice("Program log: ".length),
            );
          }
        }
      }
      console.log("Transaction simulation error");
      throw new Error(JSON.stringify(simulateResult.err));
    }

    console.log("Transaction failed");
    throw err;
  } finally {
    done = true;
  }

  console.log(successMessage);
  return txid;
}

/** Copy of Connection.simulateTransaction that takes a commitment parameter. */
export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  commitment: Commitment,
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  // @ts-expect-error yes
  transaction.recentBlockhash = await connection._recentBlockhash(
    // @ts-expect-error yes
    connection._disableBlockhashCaching,
  );

  const signData = transaction.serializeMessage();
  // @ts-expect-error yes
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString("base64");
  const config: any = { encoding: "base64", commitment };
  const args = [encodedTransaction, config];

  // @ts-expect-error yes
  const res = await connection._rpcRequest("simulateTransaction", args);
  if (res.error) {
    throw new Error("failed to simulate transaction: " + res.error.message);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.result;
}
