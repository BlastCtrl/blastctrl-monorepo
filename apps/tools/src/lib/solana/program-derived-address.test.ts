import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { findProgramDerivedAddressSync } from "./program-derived-address";

const TOKEN_METADATA_PROGRAM = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const SQUADS_PROGRAM = address("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const mint = address("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
const encoder = getAddressEncoder();

describe("findProgramDerivedAddressSync", () => {
  it("finds what kit finds", async () => {
    const seeds = [
      "metadata",
      encoder.encode(TOKEN_METADATA_PROGRAM),
      encoder.encode(mint),
    ];
    expect(
      findProgramDerivedAddressSync(TOKEN_METADATA_PROGRAM, seeds),
    ).toEqual(
      await getProgramDerivedAddress({
        programAddress: TOKEN_METADATA_PROGRAM,
        seeds,
      }),
    );
  });

  it("walks the bump down like the program does", async () => {
    // A devnet Squads multisig whose second vault needs bump 254.
    const multisig = address("Bf48pLxRT9urwqwnnDtTqaCTNHTi8oQGoVN6mBdqctVx");
    const seeds = [
      "multisig",
      encoder.encode(multisig),
      "vault",
      new Uint8Array([1]),
    ];
    expect(findProgramDerivedAddressSync(SQUADS_PROGRAM, seeds)).toEqual([
      "759B3H8VzQ8aVmt6AFkJkjAmk4gmKraTCgq5fjkdS1Hv",
      254,
    ]);
    // And many random seed sets, whatever bump they land on.
    for (let i = 0; i < 25; i++) {
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const bumped = await getProgramDerivedAddress({
        programAddress: SQUADS_PROGRAM,
        seeds: [seed],
      });
      expect(findProgramDerivedAddressSync(SQUADS_PROGRAM, [seed])).toEqual(
        bumped,
      );
    }
  });

  it("rejects seeds the program would", () => {
    const owner = getAddressDecoder().decode(new Uint8Array(32).fill(7));
    expect(() =>
      findProgramDerivedAddressSync(SQUADS_PROGRAM, [new Uint8Array(33)]),
    ).toThrow("at most 32 bytes");
    expect(() =>
      findProgramDerivedAddressSync(
        SQUADS_PROGRAM,
        Array.from({ length: 17 }, () => encoder.encode(owner)),
      ),
    ).toThrow("at most 16 seeds");
  });
});
