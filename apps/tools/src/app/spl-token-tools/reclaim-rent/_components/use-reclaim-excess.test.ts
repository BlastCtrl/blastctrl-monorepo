import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-2022";
import {
  getTransferSolInstructionDataDecoder,
  SYSTEM_PROGRAM_ADDRESS,
} from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compileTransactionMessage,
  createNoopSigner,
  createTransactionMessage,
  fillTransactionMessageProvisoryResourceLimits,
  getAddressDecoder,
  getTransactionSize,
  getTransactionSizeLimit,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import type { ServiceFee } from "./fee";
import { ACCOUNTS_PER_TRANSACTION } from "./rent";
import { buildReclaimInstructions } from "./reclaim-instructions";
import type { ReclaimableAccount } from "./types";

/** The Token programs' `CloseAccount` and `WithdrawExcessLamports`. */
const CLOSE_ACCOUNT_INSTRUCTION = 9;
const WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION = 38;

const wallet = createNoopSigner(
  address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx"),
);
const fee: ServiceFee = {
  recipient: address("So11111111111111111111111111111111111111112"),
  basisPoints: 500,
};
const lifetime = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
};

/** Distinct, deterministic addresses: 32 bytes spelling out a counter. */
let counter = 0;
const freshAddress = (): Address => {
  const bytes = new Uint8Array(32);
  bytes[0] = ++counter & 0xff;
  bytes[1] = counter >> 8;
  return getAddressDecoder().decode(bytes);
};

const tokenAccount = (
  over: Partial<ReclaimableAccount> = {},
): ReclaimableAccount => {
  const account = freshAddress();
  return {
    id: account,
    kind: "token-account",
    address: account,
    mint: freshAddress(),
    symbol: "TST",
    name: "Test",
    program: "token",
    tokenBalance: "0",
    isEmpty: true,
    dataLength: 165,
    lamports: 2_039_280,
    minimum: 1_488_440,
    ...over,
  };
};

const opcodes = (accounts: ReclaimableAccount[], closeEmpty: boolean) =>
  buildReclaimInstructions(accounts, wallet, null, closeEmpty).map(
    (ix) => ix.data![0],
  );

/**
 * The message as the kit client plans it: fee payer, the instructions and
 * the compute-limit placeholder the estimate later overwrites in place.
 */
const message = (instructions: Instruction[]) =>
  pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(wallet, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    fillTransactionMessageProvisoryResourceLimits,
  );

/** Bytes on the wire, with the one signature slot the wallet fills in. */
const wireSize = (instructions: Instruction[]) =>
  getTransactionSize(compileTransaction(message(instructions)));

/** What fits in one packet for a version 0 transaction. */
const PACKET_SIZE = getTransactionSizeLimit(compileTransaction(message([])));

describe("buildReclaimInstructions, closing empty accounts", () => {
  it("closes empty token accounts and withdraws from the rest", () => {
    const accounts = [
      tokenAccount(),
      tokenAccount({ isEmpty: false, tokenBalance: "5" }),
      tokenAccount({ program: "token-2022", dataLength: 182 }),
    ];
    expect(opcodes(accounts, true)).toEqual([
      CLOSE_ACCOUNT_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      CLOSE_ACCOUNT_INSTRUCTION,
    ]);
  });

  it("closes nothing when the switch is off", () => {
    expect(opcodes([tokenAccount(), tokenAccount()], false)).toEqual([
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
    ]);
  });

  it("never closes mints or accounts the wallet can't close", () => {
    const mint = tokenAccount({
      kind: "mint",
      isEmpty: false,
      dataLength: 82,
    });
    const frozen = tokenAccount({ keepOpenReason: "Frozen" });
    expect(opcodes([mint, frozen], true)).toEqual([
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
      WITHDRAW_EXCESS_LAMPORTS_INSTRUCTION,
    ]);
  });

  it("closes an empty account even when it holds no excess", () => {
    const atMinimum = tokenAccount({ lamports: 1_488_440 });
    expect(opcodes([atMinimum], true)).toEqual([CLOSE_ACCOUNT_INSTRUCTION]);
  });

  it("addresses each token program by the account's program", () => {
    const [token, token2022] = buildReclaimInstructions(
      [tokenAccount(), tokenAccount({ program: "token-2022" })],
      wallet,
      null,
      false,
    );
    expect(token?.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(token2022?.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
  });

  it("sends a closed account's whole deposit to the wallet, which signs", () => {
    const [close] = buildReclaimInstructions(
      [tokenAccount({ program: "token-2022" })],
      wallet,
      null,
      true,
    );
    expect(close!.accounts!.map((a) => a.address === wallet.address)).toEqual([
      false,
      true,
      true,
    ]);
    expect(close!.accounts![2]).toMatchObject({
      role: AccountRole.READONLY_SIGNER,
      signer: wallet,
    });
  });

  it("takes the fee from the excess only, even of a closed account", () => {
    const instructions = buildReclaimInstructions(
      [tokenAccount(), tokenAccount({ isEmpty: false, tokenBalance: "5" })],
      wallet,
      fee,
      true,
    );
    const transfer = instructions[2]!;
    expect(transfer.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
    // 5% of 550,840 + 550,840 lamports of excess. The closed account
    // returns all 2,039,280, but its 1,488,440 minimum carries no fee.
    expect(
      getTransferSolInstructionDataDecoder().decode(transfer.data!).amount,
    ).toBe(55_084n);
  });

  it("charges nothing for closing an account with no excess", () => {
    const atMinimum = tokenAccount({ lamports: 1_488_440 });
    expect(
      buildReclaimInstructions([atMinimum], wallet, fee, true).map(
        (ix) => ix.data![0],
      ),
    ).toEqual([CLOSE_ACCOUNT_INSTRUCTION]);
  });
});

/**
 * A transaction has to fit in one packet (1232 bytes). A full batch is the
 * worst case: every account distinct, both token programs, the fee transfer
 * bringing in the System program and the fee recipient, and the compute
 * limit the kit client adds.
 */
describe("batch size", () => {
  const fullBatch = (empty: (i: number) => boolean) =>
    Array.from({ length: ACCOUNTS_PER_TRANSACTION }, (_, i) =>
      tokenAccount({
        program: i % 2 ? "token-2022" : "token",
        isEmpty: empty(i),
        tokenBalance: empty(i) ? "0" : "5",
      }),
    );
  const build = (accounts: ReclaimableAccount[], closeEmpty: boolean) =>
    buildReclaimInstructions(accounts, wallet, fee, closeEmpty);

  const allEmpty = fullBatch(() => true);
  const withdrawals = build(allEmpty, false);
  const closes = build(allEmpty, true);
  const mixed = build(
    fullBatch((i) => i % 3 === 0),
    true,
  );

  it("builds the worst case it means to", () => {
    for (const instructions of [withdrawals, closes, mixed]) {
      expect(instructions).toHaveLength(ACCOUNTS_PER_TRANSACTION + 1);
      const compiled = compileTransactionMessage(message(instructions));
      // The wallet, the accounts, both token programs, the System program,
      // the fee recipient and the Compute Budget program.
      expect(compiled.staticAccounts).toHaveLength(
        ACCOUNTS_PER_TRANSACTION + 6,
      );
    }
  });

  it("is the same size whether accounts close or not", () => {
    expect(wireSize(closes)).toBe(wireSize(withdrawals));
    expect(wireSize(mixed)).toBe(wireSize(withdrawals));
  });

  it("fits in a packet", () => {
    expect(wireSize(withdrawals)).toBeLessThanOrEqual(PACKET_SIZE);
  });

  // Wallets like Phantom add a compute unit price when the transaction
  // doesn't set one (the client sets the limit).
  it("leaves room for a wallet to add a priority fee instruction", () => {
    const setComputeUnitPrice: Instruction = {
      programAddress: address("ComputeBudget111111111111111111111111111111"),
      data: new Uint8Array([3, 16, 39, 0, 0, 0, 0, 0, 0]),
    };
    expect(
      wireSize([...build(allEmpty, true), setComputeUnitPrice]),
    ).toBeLessThanOrEqual(PACKET_SIZE);
  });
});
