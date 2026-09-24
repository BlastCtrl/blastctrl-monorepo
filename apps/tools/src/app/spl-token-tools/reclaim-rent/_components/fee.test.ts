import { Keypair, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { parseServiceFee, serviceFeeLamports } from "./fee";
import type { ReclaimableAccount } from "./types";
import { buildReclaimTransaction } from "./use-reclaim-excess";

const recipient = Keypair.generate().publicKey.toBase58();

describe("parseServiceFee", () => {
  it("reads the recipient and the rate", () => {
    const fee = parseServiceFee(recipient, "500");
    expect(fee?.recipient.toBase58()).toBe(recipient);
    expect(fee?.basisPoints).toBe(500);
  });

  it("is off when either variable is missing or the rate is not usable", () => {
    expect(parseServiceFee(undefined, "500")).toBeNull();
    expect(parseServiceFee(recipient, undefined)).toBeNull();
    expect(parseServiceFee(recipient, "")).toBeNull();
    expect(parseServiceFee(recipient, "0")).toBeNull();
    expect(parseServiceFee(recipient, "abc")).toBeNull();
    expect(parseServiceFee(recipient, "1.5")).toBeNull();
    expect(parseServiceFee(recipient, "10001")).toBeNull();
  });
});

describe("serviceFeeLamports", () => {
  it("takes a share of the excess, rounded down", () => {
    const fee = parseServiceFee(recipient, "500");
    expect(serviceFeeLamports(550_840, fee)).toBe(27_542);
    expect(serviceFeeLamports(19, fee)).toBe(0);
    expect(serviceFeeLamports(550_840, null)).toBe(0);
  });
});

describe("buildReclaimTransaction", () => {
  const wallet = Keypair.generate().publicKey;
  const lifetime = {
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1,
  };
  const account = (
    program: "token" | "token-2022",
    lamports = 2_039_280,
  ): ReclaimableAccount => ({
    id: Keypair.generate().publicKey.toBase58(),
    kind: "token-account",
    address: Keypair.generate().publicKey.toBase58(),
    mint: Keypair.generate().publicKey.toBase58(),
    symbol: "TST",
    name: "Test",
    program,
    tokenBalance: "0",
    isEmpty: true,
    dataLength: 165,
    lamports,
    minimum: 1_488_440,
  });

  it("adds one fee transfer for the batch after the withdrawals", () => {
    const fee = parseServiceFee(recipient, "500")!;
    const tx = buildReclaimTransaction(
      [account("token"), account("token-2022"), account("token")],
      wallet,
      lifetime,
      fee,
    );
    expect(tx.instructions).toHaveLength(4);
    const transfer = tx.instructions[3]!;
    expect(transfer.programId.equals(SystemProgram.programId)).toBe(true);
    expect(transfer.keys[0]!.pubkey.equals(wallet)).toBe(true);
    expect(transfer.keys[1]!.pubkey.equals(fee.recipient)).toBe(true);
    // Transfer data: u32 index (2) + u64 lamports, little endian.
    expect(transfer.data.readUInt32LE(0)).toBe(2);
    // 5% of 3 × 550,840 lamports of excess.
    expect(Number(transfer.data.readBigUInt64LE(4))).toBe(82_626);
  });

  it("adds nothing when there is no fee or it rounds to zero", () => {
    const fee = parseServiceFee(recipient, "500")!;
    expect(
      buildReclaimTransaction([account("token")], wallet, lifetime, null)
        .instructions,
    ).toHaveLength(1);
    expect(
      buildReclaimTransaction(
        [account("token", 1_488_450)],
        wallet,
        lifetime,
        fee,
      ).instructions,
    ).toHaveLength(1);
  });
});
