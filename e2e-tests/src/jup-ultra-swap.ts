import { NATIVE_MINT } from "@solana/spl-token";
import config from "./config.js";
import { VersionedTransaction } from "@solana/web3.js";

const BASE_URL = "https://api.jup.ag/ultra/v1";

export async function runJupiterUltraSwap(amount: number) {
  const orderResponse = await fetch(`${BASE_URL}/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputMint: config.usdcMint,
      outputMint: NATIVE_MINT,
      amount,
      taker: config.funder.publicKey.toString(),
    }),
  });

  if (!orderResponse.ok) {
    throw new Error(`Failed to get Jupiter Swap order: ${orderResponse.statusText}`);
  }

  const orderData = await orderResponse.json();
  const transactionBase64 = orderData.transaction;
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));

  transaction.sign([config.funder]);
  const signedTransaction = Buffer.from(transaction.serialize()).toString("base64");

  const executeResponse = await (
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
  ).json();

  if (executeResponse.status === "Success") {
    console.log("Swap successful:", JSON.stringify(executeResponse, null, 2));
    console.log(`https://solscan.io/tx/${executeResponse.signature}`);
  } else {
    console.error("Swap failed:", JSON.stringify(executeResponse, null, 2));
    console.log(`https://solscan.io/tx/${executeResponse.signature}`);
  }

  return executeResponse;
}
