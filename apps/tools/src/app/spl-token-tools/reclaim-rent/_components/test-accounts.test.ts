import { Keypair, PACKET_DATA_SIZE } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  DEMO_MINTS,
  MINTS_PER_TRANSACTION,
  buildTestAccountTransactions,
} from "./test-accounts";

describe("buildTestAccountTransactions", () => {
  const wallet = Keypair.generate().publicKey;
  const lifetime = {
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1,
  };
  const txs = buildTestAccountTransactions(
    DEMO_MINTS,
    wallet,
    lifetime,
    550_840,
  );

  it("covers every demo mint, a create and a transfer each", () => {
    expect(txs).toHaveLength(
      Math.ceil(DEMO_MINTS.length / MINTS_PER_TRANSACTION),
    );
    expect(txs.flatMap((tx) => tx.instructions)).toHaveLength(
      DEMO_MINTS.length * 2,
    );
  });

  it("fits every transaction in a packet", () => {
    for (const tx of txs) {
      expect(
        tx.serialize({ requireAllSignatures: false, verifySignatures: false })
          .length,
      ).toBeLessThanOrEqual(PACKET_DATA_SIZE);
    }
  });
});
