import { sha256 } from "@noble/hashes/sha2";
import {
  getAddressDecoder,
  getAddressEncoder,
  isOffCurveAddress,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

const MAX_SEEDS = 16;
const MAX_SEED_LENGTH = 32;
const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

/**
 * The program derived address of `seeds` under `programAddress`, with its
 * bump: what kit's `getProgramDerivedAddress` finds, found synchronously.
 * Kit hashes with the Web Crypto API, which is async; this hashes in
 * JavaScript, for the one caller that can't await, Umi's `findPda`
 * interface. Everything else should use kit's.
 */
export function findProgramDerivedAddressSync(
  programAddress: Address,
  seeds: readonly (string | ReadonlyUint8Array)[],
): [Address, number] {
  if (seeds.length > MAX_SEEDS) {
    throw new Error(
      `A program derived address takes at most ${MAX_SEEDS} seeds`,
    );
  }
  const seedBytes: ReadonlyUint8Array[] = seeds.map((seed) =>
    typeof seed === "string" ? new TextEncoder().encode(seed) : seed,
  );
  for (const seed of seedBytes) {
    if (seed.length > MAX_SEED_LENGTH) {
      throw new Error(`A seed is at most ${MAX_SEED_LENGTH} bytes`);
    }
  }
  const programBytes = getAddressEncoder().encode(programAddress);
  const decoder = getAddressDecoder();
  for (let bump = 255; bump > 0; bump--) {
    const address = decoder.decode(
      sha256(
        concat([
          ...seedBytes,
          new Uint8Array([bump]),
          programBytes,
          PDA_MARKER,
        ]),
      ),
    );
    if (isOffCurveAddress(address)) return [address, bump];
  }
  throw new Error("No bump seed gives an address off the curve");
}

function concat(parts: readonly ReadonlyUint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
