import {
  discoverReclaimableAccounts,
  excessLamports,
  closes,
  quoteReclaim,
  reclaimLamports,
  type DiscoveredAccount,
} from "@blastctrl/rent-reclaimer";
import { address, createSolanaRpc } from "@solana/kit";

export const RECLAIM_URL = "https://reclaim.blastctrl.com";
export const ACCOUNT_LIMIT = 5000;
export const DETAIL_LIMIT = 20;
export const SCAN_TIMEOUT_MS = 25_000;

export type Scan = (
  address: string,
  signal: AbortSignal,
) => Promise<DiscoveredAccount[]>;

/**
 * RPC credentials remain on this server. The caller cannot choose an RPC URL.
 * `RPC_ENDPOINT` is trusted to be a mainnet endpoint; nothing checks it.
 */
export function createRpcScan(rpcUrl: string): Scan {
  const rpc = createSolanaRpc(rpcUrl);
  return async (owner, abortSignal) =>
    discoverReclaimableAccounts(rpc, address(owner), {
      maxAccounts: ACCOUNT_LIMIT,
      abortSignal,
    });
}

export function summarize(
  address: string,
  accounts: DiscoveredAccount[],
  serviceFeeBasisPoints: number,
) {
  // Match reclaim.blastctrl.com: token accounts by return, then mints in
  // scan order, and eligible empty accounts always close.
  const ordered = [...accounts].sort(
    (a, b) =>
      Number(a.kind === "mint") - Number(b.kind === "mint") ||
      (a.kind === "token-account"
        ? reclaimLamports(b, true) - reclaimLamports(a, true)
        : 0),
  );
  const estimate = quoteReclaim(ordered, true, serviceFeeBasisPoints);
  const relevant = ordered.filter(
    (a) => a.blockedReason || reclaimLamports(a, true) > 0,
  );
  return {
    address,
    network: "mainnet-beta" as const,
    scannedAt: new Date().toISOString(),
    serviceFeeBasisPoints,
    scannedAccountCount: accounts.length,
    excludedAccountCount: accounts.filter((a) => a.blockedReason).length,
    estimate,
    accountSummary: relevant.slice(0, DETAIL_LIMIT).map((a) => ({
      address: a.address,
      mint: a.mint,
      kind: a.kind,
      program: a.program,
      excessLamports: excessLamports(a).toString(),
      canCloseEmptyAccount: closes(a, true),
      ...(a.blockedReason ? { excludedReason: a.blockedReason } : {}),
      ...(a.keepOpenReason ? { keepOpenReason: a.keepOpenReason } : {}),
    })),
    accountSummaryTruncated: relevant.length > DETAIL_LIMIT,
    relevantAccountCount: relevant.length,
    reclaimUrl: RECLAIM_URL,
    notes: [
      "This is an estimate from public mainnet data. No wallet was connected and no transaction was created or sent.",
      "The scan covers SPL Token and Token-2022 accounts and controlled mints referenced by those accounts. Other controlled mints, stake accounts, and arbitrary program accounts are not included.",
      "The estimate assumes eligible empty token accounts are closed, which returns their whole rent deposit. Other accounts give up only their excess rent.",
      "Network fees use the web tool's base estimate of 5000 lamports per transaction. Wallet priority fees are not included. Fees and balances can change.",
      "The estimate assumes an owner that can sign directly. It does not establish control of this address or support multisig signing.",
      "To reclaim, open the BlastCtrl app, connect this address, and run a new scan. The website does not read an address from this link.",
    ],
  };
}
