import type {
  SimulatedTransactionResponse,
  VersionedTransaction,
} from "@solana/web3.js";
import { Connection } from "@solana/web3.js";

// Simulate a signed, serialized transaction before broadcasting
export async function simulateV0Transaction(
  connection: Connection,
  versionedTransaction: VersionedTransaction,
): Promise<SimulatedTransactionResponse> {
  /*
       Simulating a transaction directly can cause the `signatures` property to change.
       Possibly related:
       https://github.com/solana-labs/solana/issues/21722
       https://github.com/solana-labs/solana/pull/21724
       https://github.com/solana-labs/solana/issues/20743
       https://github.com/solana-labs/solana/issues/22021

       Clone it from the bytes instead, and make sure it's likely to succeed before paying for it.

       Within simulateTransaction there is a "transaction instanceof Transaction" check. Since connection is passed
       from outside the library, it uses parent application's version of web3.js. "instanceof" won't recognize a match.
       Instead, let's explicitly call for simulateTransaction within the dependency of the library.
     */

  const simulated = await Connection.prototype.simulateTransaction.call(
    connection,
    versionedTransaction,
    {
      sigVerify: false,
    },
  );
  if (simulated.value.err) {
    console.log(simulated);
    throw new Error("Simulation error");
  }

  return simulated.value;
}
