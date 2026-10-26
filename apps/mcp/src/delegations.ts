import {
  fetchDelegatedTokenAccounts,
  type ParsedDelegatedTokenAccount,
} from "@blastctrl/token-scans";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address, createSolanaRpc } from "@solana/kit";
import { DETAIL_LIMIT } from "./analysis";
import { fetchMintDecimals, formatTokenAmount } from "./mints";

export const REVOKE_URL =
  "https://tools.blastctrl.com/spl-token-tools/revoke-delegations";

const U64_MAX = 2n ** 64n - 1n;

export type DelegationScanResult = {
  accounts: ParsedDelegatedTokenAccount[];
  /** Decimals of the mints of the first {@link DETAIL_LIMIT} accounts. */
  mintDecimals: Record<string, number>;
};

export type DelegationScan = (
  address: string,
  signal: AbortSignal,
) => Promise<DelegationScanResult>;

/** The revoke-delegations tool's scan, plus decimals for the listed rows. */
export function createRpcDelegationScan(rpcUrl: string): DelegationScan {
  const rpc = createSolanaRpc(rpcUrl);
  return async (owner, abortSignal) => {
    const accounts = await fetchDelegatedTokenAccounts(rpc, address(owner), {
      abortSignal,
    });
    const mintDecimals = await fetchMintDecimals(
      rpc,
      accounts.slice(0, DETAIL_LIMIT).map((a) => a.mint),
      abortSignal,
    );
    return { accounts, mintDecimals };
  };
}

export function summarizeDelegations(
  address: string,
  { accounts, mintDecimals }: DelegationScanResult,
) {
  const amount = (raw: bigint, mint: string) =>
    mintDecimals[mint] === undefined
      ? {}
      : { amount: formatTokenAmount(raw, mintDecimals[mint]) };
  return {
    address,
    network: "mainnet-beta" as const,
    scannedAt: new Date().toISOString(),
    delegatedAccountCount: accounts.length,
    accounts: accounts.slice(0, DETAIL_LIMIT).map((a) => ({
      tokenAccount: a.token_account,
      mint: a.mint,
      program:
        a.token_program === TOKEN_PROGRAM_ADDRESS
          ? ("token" as const)
          : ("token-2022" as const),
      delegate: a.delegate,
      delegatedAmount: {
        raw: a.delegated_amount.toString(),
        ...amount(a.delegated_amount, a.mint),
      },
      balance: { raw: a.balance.toString(), ...amount(a.balance, a.mint) },
      unlimited: a.delegated_amount === U64_MAX,
      coversWholeBalance: a.delegated_amount >= a.balance,
      frozen: a.isFrozen,
    })),
    accountsTruncated: accounts.length > DETAIL_LIMIT,
    revokeUrl: REVOKE_URL,
    notes: [
      "This is a read-only check of public mainnet data. No wallet was connected and no transaction was created or sent.",
      "A delegate can transfer up to the delegated amount out of the token account without the owner's signature, until the delegation is revoked or used up. Some DeFi protocols and services rely on delegations, so review each one before revoking.",
      "The check covers SPL Token and Token-2022 accounts owned directly by this address.",
      "Amounts are given in the token's base units (raw) and, where the mint could be read, in whole tokens.",
      "To revoke, open the BlastCtrl revoke delegations tool, connect this address, and load its delegated accounts there. The page does not read an address from this link.",
    ],
  };
}
