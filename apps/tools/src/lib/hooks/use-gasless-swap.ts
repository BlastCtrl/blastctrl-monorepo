import { useKitClient } from "@/connector/use-kit-client";
import { buildSwapToSol, type SwapTransaction } from "@/lib/octane";
import {
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  getSignatureFromTransaction,
  isTransactionModifyingSigner,
  sendAndConfirmTransactionFactory,
} from "@solana/kit";

/**
 * The gasless swap in two steps, so the page can show each: `prepare` gets
 * the fee-payer-signed transaction from the backend and has the wallet sign
 * it; `send` sends and confirms it. The fee payer has already signed, so the
 * wallet is only asked to sign: Phantom blocks sign-and-send requests for
 * transactions with another signer as possibly malicious.
 */
export function useGaslessSwap() {
  const { client } = useKitClient();

  const prepare = async (
    sourceMint: string,
    amount: number,
    slippageBps: number,
  ) => {
    if (!client) throw Error("Wallet not connected");
    if (!isTransactionModifyingSigner(client.payer)) {
      throw Error("The connected wallet can't sign transactions");
    }
    const { transaction, quote } = await buildSwapToSol(
      client.payer.address,
      sourceMint,
      amount,
      slippageBps,
    );
    const [signed] = await client.payer.modifyAndSignTransactions([
      transaction,
    ]);
    return { signed: signed as SwapTransaction, quote };
  };

  const send = async (signed: SwapTransaction) => {
    if (!client) throw Error("Wallet not connected");
    assertIsSendableTransaction(signed);
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendAndConfirmTransactionFactory({
      rpc: client.rpc,
      rpcSubscriptions: client.rpcSubscriptions,
    })(signed, { commitment: "confirmed" });
    return getSignatureFromTransaction(signed);
  };

  return { ready: !!client, prepare, send };
}
