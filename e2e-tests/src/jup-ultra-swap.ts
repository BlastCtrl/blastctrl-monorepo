import { NATIVE_MINT } from "@solana/spl-token";
import config from "./config.js";
import { VersionedTransaction } from "@solana/web3.js";

const BASE_URL = "https://api.jup.ag/ultra/v1";

interface SuccessfulSwapResponse {
  status: "Success";
  signature: string;
  slot: string;
  code: number;
  inputAmountResult: string;
  outputAmountResult: string;
  swapEvents: SwapEvent[];
}

interface FailedSwapResponse {
  status: "Failed";
  signature: string;
  error: string;
  code: number;
  slot: string;
}

type SwapResponse = SuccessfulSwapResponse | FailedSwapResponse;

export async function runJupiterUltraSwap(amount: number) {
  const orderUrl = new URL(`${BASE_URL}/order`);
  orderUrl.searchParams.append("inputMint", NATIVE_MINT.toString());
  orderUrl.searchParams.append("outputMint", config.usdcMint.toString());
  orderUrl.searchParams.append("amount", amount.toString());
  orderUrl.searchParams.append("taker", config.funder.publicKey.toString());

  const orderResponse = await fetch(orderUrl, {
    method: "GET",
  });

  if (!orderResponse.ok) {
    console.log(await orderResponse.text());
    throw new Error(`Failed to get Jupiter Swap order: ${orderResponse.statusText}`);
  }

  const orderData = await orderResponse.json();
  const transactionBase64 = orderData.transaction;
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));

  transaction.sign([config.funder]);
  const signedTransaction = Buffer.from(transaction.serialize()).toString("base64");

  const executeResponse = (await (
    await fetch("https://api.jup.ag/ultra/v1/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signedTransaction: signedTransaction,
        requestId: orderData.requestId,
      }),
    })
  ).json()) as SwapResponse;

  return executeResponse;
}

interface SwapEvent {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
}
