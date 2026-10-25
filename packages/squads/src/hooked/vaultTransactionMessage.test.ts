import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";

import { golden, hex, kitInstruction } from "../fixtures/sdk-golden";
import {
  compileVaultTransactionMessage,
  encodeVaultTransactionMessage,
  getCompactTransactionMessageCodec,
  getCompactTransactionMessageDecoder,
} from "./vaultTransactionMessage";

describe("compact vault transaction message", () => {
  for (const name of ["single", "mixed"] as const) {
    it(`compiles and encodes the SDK's "${name}" message byte-for-byte`, () => {
      const fixture = golden[name];
      const input = {
        vault: address(fixture.vault),
        instructions: fixture.instructions.map(kitInstruction),
      };
      const bytes = encodeVaultTransactionMessage(input);
      expect(bytes).toEqual(hex(fixture.bytes));

      // Decoding the SDK's bytes gives back what the compiler produced.
      const decoded = getCompactTransactionMessageDecoder().decode(
        hex(fixture.bytes),
      );
      expect(decoded).toEqual(compileVaultTransactionMessage(input));
      expect(decoded.accountKeys[0]).toBe(fixture.vault);
    });
  }

  it("orders the mixed message's accounts by role and indexes them", () => {
    const message = compileVaultTransactionMessage({
      vault: address(golden.mixed.vault),
      instructions: golden.mixed.instructions.map(kitInstruction),
    });
    // The vault signs (writable as the fee payer); BWia is writable in the
    // second instruction; the rest are readonly, programs included.
    expect(message).toMatchObject({
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 1,
    });
    expect(message.accountKeys).toHaveLength(5);
    expect(message.instructions[1]?.data).toHaveLength(300);
  });

  it("round-trips address table lookups", () => {
    const codec = getCompactTransactionMessageCodec();
    const value = {
      numSigners: 1,
      numWritableSigners: 1,
      numWritableNonSigners: 0,
      accountKeys: [address(golden.single.vault)],
      instructions: [],
      addressTableLookups: [
        {
          accountKey: address("BWia4unXYeEZAeZeTQFQ2sKoeQQmeGhGmVQ7z4GZJJnx"),
          writableIndexes: new Uint8Array([0, 2]),
          readonlyIndexes: new Uint8Array([1]),
        },
      ],
    };
    expect(codec.decode(codec.encode(value))).toEqual(value);
  });
});
