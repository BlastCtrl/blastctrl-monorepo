import {
  getTransferSolInstructionDataDecoder,
  SYSTEM_PROGRAM_ADDRESS,
} from "@solana-program/system";
import {
  AccountRole,
  address,
  createNoopSigner,
  getAddressDecoder,
  type Address,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { serviceFeeLamports, type ServiceFee } from "./fee";
import { buildReclaimInstructions } from "./reclaim-instructions";
import type { ReclaimableAccount } from "./types";

/** 5% to the wrapped SOL mint, as good an address as any. */
const fee: ServiceFee = {
  recipient: address("So11111111111111111111111111111111111111112"),
  basisPoints: 500,
};

describe("serviceFeeLamports", () => {
  it("takes a share of the excess, rounded down", () => {
    expect(serviceFeeLamports(550_840, fee)).toBe(27_542);
    expect(serviceFeeLamports(19, fee)).toBe(0);
    expect(serviceFeeLamports(550_840, null)).toBe(0);
  });
});

describe("buildReclaimInstructions", () => {
  const wallet = createNoopSigner(
    address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx"),
  );
  let counter = 0;
  const freshAddress = (): Address =>
    getAddressDecoder().decode(new Uint8Array(32).fill(++counter));
  const account = (
    program: "token" | "token-2022",
    lamports = 2_039_280,
  ): ReclaimableAccount => ({
    id: freshAddress(),
    kind: "token-account",
    address: freshAddress(),
    mint: freshAddress(),
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
    const instructions = buildReclaimInstructions(
      [account("token"), account("token-2022"), account("token")],
      wallet,
      fee,
      false,
    );
    expect(instructions).toHaveLength(4);
    const transfer = instructions[3]!;
    expect(transfer.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(transfer.accounts![0]).toMatchObject({
      address: wallet.address,
      role: AccountRole.WRITABLE_SIGNER,
      signer: wallet,
    });
    expect(transfer.accounts![1]).toMatchObject({
      address: fee.recipient,
      role: AccountRole.WRITABLE,
    });
    // 5% of 3 × 550,840 lamports of excess.
    expect(
      getTransferSolInstructionDataDecoder().decode(transfer.data!),
    ).toEqual({ discriminator: 2, amount: 82_626n });
  });

  it("adds nothing when there is no fee or it rounds to zero", () => {
    expect(
      buildReclaimInstructions([account("token")], wallet, null, false),
    ).toHaveLength(1);
    expect(
      buildReclaimInstructions(
        [account("token", 1_488_450)],
        wallet,
        fee,
        false,
      ),
    ).toHaveLength(1);
  });
});
