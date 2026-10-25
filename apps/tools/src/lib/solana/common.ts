import { formatDecimalFixedPoint } from "@solana/fixed-points";
import { lamports, lamportsToSol } from "@solana/kit";

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

/**
 * `value` lamports as SOL for display, with thousands separators and up to
 * `maximumFractionDigits` decimals ("1,234.5"). Kit's `Sol` is unsigned, so
 * a negative amount is formatted by its magnitude and given its sign back.
 */
export function lamportsToSolString(
  value: number | bigint,
  maximumFractionDigits = 9,
): string {
  const negative = value < 0;
  const magnitude =
    typeof value === "bigint"
      ? negative
        ? -value
        : value
      : BigInt(Math.trunc(Math.abs(value)));
  const formatted = formatDecimalFixedPoint(
    new Intl.NumberFormat("en-US", { maximumFractionDigits }),
    lamportsToSol(lamports(magnitude)),
  );
  return negative ? `-${formatted}` : formatted;
}
