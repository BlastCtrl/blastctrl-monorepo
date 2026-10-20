import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import base58 from "bs58";

export function isPublicKey(putativeAddress: string) {
  // Based on the implementation of assertIsAddress in the new web3.js SDK666
  // Fast-path; see if the input string is of an acceptable length.
  if (
    // Lowest address (32 bytes of zeroes)
    putativeAddress.length < 32 ||
    // Highest address (32 bytes of 255)
    putativeAddress.length > 44
  ) {
    return false;
  }
  // Slow-path; actually attempt to decode the input string.

  const bytes = base58.decodeUnsafe(putativeAddress);
  return 32 === bytes?.byteLength;
}

export function compress(str: string, chars: number) {
  return str.slice(0, chars) + "..." + str.slice(-chars);
}

////////////////
// Converting //
////////////////
export function normalizeTokenAmount(
  raw: string | number,
  decimals: number,
): number {
  let rawTokens: number;
  if (typeof raw === "string") rawTokens = parseInt(raw);
  else rawTokens = raw;
  return rawTokens / Math.pow(10, decimals);
}

export function lamportsToSol(lamports: number | bigint): number {
  if (typeof lamports === "number") {
    return lamports / LAMPORTS_PER_SOL;
  }

  let signMultiplier = 1;
  if (lamports < 0) {
    signMultiplier = -1;
  }

  const absLamports = lamports < 0 ? -lamports : lamports;
  const lamportsString = absLamports.toString(10).padStart(10, "0");
  const splitIndex = lamportsString.length - 9;
  const solString =
    lamportsString.slice(0, splitIndex) +
    "." +
    lamportsString.slice(splitIndex);
  return signMultiplier * parseFloat(solString);
}

export function lamportsToSolString(
  lamports: number | bigint,
  maximumFractionDigits = 9,
): string {
  const sol = lamportsToSol(lamports);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(sol);
}
