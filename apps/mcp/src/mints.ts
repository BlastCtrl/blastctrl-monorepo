import { decodeMint } from "@solana-program/token";
import {
  address,
  fetchEncodedAccounts,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";

/**
 * Decimals of up to 100 mints (one `getMultipleAccounts`), keyed by mint.
 * Missing or undecodable mints are left out; amounts for them stay raw.
 */
export async function fetchMintDecimals(
  rpc: Rpc<GetMultipleAccountsApi>,
  mints: string[],
  abortSignal: AbortSignal,
): Promise<Record<string, number>> {
  const unique = [...new Set(mints)].slice(0, 100);
  if (unique.length === 0) return {};
  const accounts = await fetchEncodedAccounts(rpc, unique.map(address), {
    abortSignal,
  });
  const decimals: Record<string, number> = {};
  for (const account of accounts) {
    if (!account.exists) continue;
    try {
      decimals[account.address] = decodeMint(account).data.decimals;
    } catch {
      // Not a mint; skip it rather than fail the result.
    }
  }
  return decimals;
}

/** A raw token amount in whole tokens, exact, trailing zeros dropped. */
export function formatTokenAmount(raw: bigint, decimals: number) {
  if (decimals === 0) return raw.toString();
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
