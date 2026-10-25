import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
} from "@solana/kit";
import config from "./config.js";

const BASE_URL = "https://lite-api.jup.ag/ultra/v1";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

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
  orderUrl.searchParams.append("inputMint", WSOL_MINT);
  orderUrl.searchParams.append("outputMint", config.usdcMint);
  orderUrl.searchParams.append("amount", amount.toString());
  orderUrl.searchParams.append("taker", config.funder.address);

  const orderResponse = await fetch(orderUrl, {
    method: "GET",
  });

  if (!orderResponse.ok) {
    console.log(await orderResponse.text());
    throw new Error(`Failed to get Jupiter Swap order: ${orderResponse.statusText}`);
  }

  const orderData = await orderResponse.json();
  const transactionBase64 = orderData.transaction;
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(transactionBase64));

  // Partially: like web3's VersionedTransaction.sign, this fills in the
  // taker's signature and leaves any other slot to Jupiter.
  const signed = await partiallySignTransaction([config.funder.keyPair], transaction);
  const signedTransaction = getBase64EncodedWireTransaction(signed);

  const executeResponse = (await (
    await fetch(`${BASE_URL}/execute`, {
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
