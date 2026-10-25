import { MIN_DELEGATION_LAMPORTS } from "@/lib/solana/stake-account";
import { address, lamports, type Address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  parseSolInput,
  splitAmountError,
  splitBounds,
  splittableLamports,
  type SplitSource,
} from "./split-plan";

const SOL = 1_000_000_000n;
const RENT = 2_282_880n;
const key = address("11111111111111111111111111111111");

const meta = {
  rentExemptReserve: lamports(RENT),
  authorized: { staker: key, withdrawer: key },
  lockup: { unixTimestamp: 0n, epoch: 0n, custodian: key },
};

/** A delegated account holding `stake` plus rent plus `excess` free lamports. */
const delegated = (stake: bigint, excess = 0n): SplitSource => ({
  lamports: lamports(stake + RENT + excess),
  meta,
  stake: {
    delegation: {
      voterPubkey: key as Address,
      stake,
      activationEpoch: 1n,
      deactivationEpoch: 18446744073709551615n,
      reserved: [],
    },
    creditsObserved: 0n,
  },
});

const undelegated = (total: bigint): SplitSource => ({
  lamports: lamports(total),
  meta,
  stake: null,
});

describe("splittableLamports", () => {
  it("is the delegated stake, never the free lamports", () => {
    expect(splittableLamports(delegated(3n * SOL, 300_000_000n), RENT)).toBe(
      3n * SOL,
    );
  });
  it("is everything above rent for an undelegated account", () => {
    expect(splittableLamports(undelegated(2n * SOL + RENT), RENT)).toBe(
      2n * SOL,
    );
    expect(splittableLamports(undelegated(RENT), RENT)).toBe(0n);
  });
});

describe("splitBounds", () => {
  it("keeps the minimum delegation on both sides", () => {
    expect(splitBounds(delegated(3n * SOL), RENT)).toEqual({
      min: MIN_DELEGATION_LAMPORTS,
      max: 2n * SOL,
    });
    expect(splitBounds(delegated(2n * SOL), RENT)).toEqual({
      min: SOL,
      max: SOL,
    });
  });
  it("is null below two minimum delegations", () => {
    expect(splitBounds(delegated(2n * SOL - 1n), RENT)).toBeNull();
  });
  it("lets an undelegated account split anything above rent", () => {
    expect(splitBounds(undelegated(SOL + RENT), RENT)).toEqual({
      min: 1n,
      max: SOL,
    });
    expect(splitBounds(undelegated(RENT), RENT)).toBeNull();
  });
});

describe("splitAmountError", () => {
  const source = delegated(3n * SOL);
  it("accepts amounts inside the bounds", () => {
    expect(splitAmountError(source, SOL, RENT)).toBeNull();
    expect(splitAmountError(source, 2n * SOL, RENT)).toBeNull();
    expect(splitAmountError(source, 1_500_000_000n, RENT)).toBeNull();
  });
  it("explains each refusal", () => {
    expect(splitAmountError(source, 0n, RENT)).toMatch(/greater than 0/);
    expect(splitAmountError(source, SOL - 1n, RENT)).toMatch(
      /new account needs at least 1 SOL/,
    );
    expect(splitAmountError(source, 2n * SOL + 1n, RENT)).toMatch(
      /keep at least 1 SOL.*at most 2 SOL/,
    );
    expect(splitAmountError(delegated(SOL), SOL / 2n, RENT)).toMatch(
      /at least 2 SOL of stake/,
    );
  });
  it("only asks an undelegated account to stay rent-exempt", () => {
    const source = undelegated(2n * SOL + RENT);
    expect(splitAmountError(source, 1n, RENT)).toBeNull();
    expect(splitAmountError(source, 2n * SOL, RENT)).toBeNull();
    expect(splitAmountError(source, 2n * SOL + 1n, RENT)).toMatch(
      /at most 2 SOL/i,
    );
  });
});

describe("parseSolInput", () => {
  it("parses decimal SOL exactly", () => {
    expect(parseSolInput("1.5")).toBe(1_500_000_000n);
    expect(parseSolInput("0.000000001")).toBe(1n);
    expect(parseSolInput("2")).toBe(2n * SOL);
  });
  it("rejects what is not an amount", () => {
    expect(parseSolInput("")).toBeNull();
    expect(parseSolInput(".")).toBeNull();
    expect(parseSolInput("1.0000000001")).toBeNull();
    expect(parseSolInput("abc")).toBeNull();
  });
});
