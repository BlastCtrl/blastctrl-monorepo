// Mock mints for the reclaim-rent demo. Token accounts come from the chain.

import {
  FALLBACK_LAMPORTS_PER_BYTE,
  MINT_SIZE,
  ORIGINAL_LAMPORTS_PER_BYTE,
  minimumBalance,
} from "./rent";
import type { ReclaimableAccount } from "./types";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// 43 base58 characters with a high first digit always decode to 32 bytes, so
// these pass the app's address validation.
export function fakeAddress(seed: string, length = 43) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    out += i === 0 ? ALPHABET[5 + (h % 53)] : ALPHABET[h % ALPHABET.length];
  }
  return out;
}

// Mints. A wallet can't list the mints it controls, so the user pastes them.

export type MintLookup =
  | { status: "ok"; account: ReclaimableAccount }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" };

export const EXAMPLE_MINTS = [
  {
    label: "A mint you control",
    address: fakeAddress("example-mint-ok"),
  },
  {
    label: "Someone else's mint",
    address: fakeAddress("example-mint-other"),
  },
  {
    label: "Authority revoked",
    address: fakeAddress("example-mint-revoked"),
  },
  {
    label: "Not a mint",
    address: fakeAddress("example-not-a-mint"),
  },
];

const MINT_NAMES = [
  ["BLAST", "Blast Community Token"],
  ["PIXL", "Pixel Guild Points"],
  ["CREW", "Crew Pass"],
  ["TIX", "Launch Ticket"],
] as const;

export function lookupMockMint(address: string): MintLookup {
  const [ok, other, revoked, notMint] = EXAMPLE_MINTS.map((m) => m.address);
  if (address === notMint) return { status: "not-a-mint" };
  if (address === other) {
    return {
      status: "other-authority",
      name: "Jupiter",
      authority: fakeAddress("other-authority"),
    };
  }
  if (address === revoked) return { status: "no-authority", name: "Bonk" };

  // Everything else is treated as a mint the connected wallet controls.
  const index = address === ok ? 0 : address.charCodeAt(0) % MINT_NAMES.length;
  const [symbol, name] = MINT_NAMES[index]!;
  const isToken2022 = address !== ok && address.charCodeAt(1) % 2 === 0;
  const dataLength = isToken2022 ? 234 : MINT_SIZE;
  return {
    status: "ok",
    account: {
      id: `mint-${address}`,
      kind: "mint",
      address,
      mint: address,
      symbol,
      name,
      program: isToken2022 ? "token-2022" : "token",
      tokenBalance: "",
      isEmpty: false,
      dataLength,
      lamports: minimumBalance(dataLength, ORIGINAL_LAMPORTS_PER_BYTE),
      minimum: minimumBalance(dataLength, FALLBACK_LAMPORTS_PER_BYTE),
    },
  };
}
