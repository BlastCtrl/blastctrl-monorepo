import { solString } from "@blastctrl/rent-reclaimer";
import {
  fetchTokenAccountsByOwner,
  filterAssociatedTokenAccounts,
  findNestedAta,
  type NestedPair,
} from "@blastctrl/token-scans";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address, createSolanaRpc } from "@solana/kit";
import { DETAIL_LIMIT } from "./analysis";
import { fetchMintDecimals, formatTokenAmount } from "./mints";

export const RECOVER_NESTED_URL =
  "https://tools.blastctrl.com/spl-token-tools/recover-nested";
/** Each ATA costs two RPC requests, all inside the scan deadline. */
export const NESTED_PARENT_LIMIT = 500;
export const NESTED_CONCURRENCY = 10;

export class NestedScanLimitError extends Error {
  constructor() {
    super(
      `This address has more than ${NESTED_PARENT_LIMIT} associated token accounts, too many to check for nested accounts in one request. No result was returned. The BlastCtrl recover nested tool can run the full search.`,
    );
    this.name = "NestedScanLimitError";
  }
}

export type NestedScanResult = {
  /** How many of the wallet's associated token accounts were checked. */
  parentCount: number;
  pairs: NestedPair[];
  mintDecimals: Record<string, number>;
};

export type NestedScan = (
  address: string,
  signal: AbortSignal,
) => Promise<NestedScanResult>;

/** Recoverable pairs first, then the scan's order. */
function ordered(pairs: NestedPair[]) {
  return [...pairs].sort(
    (a, b) => Number(b.recoverable) - Number(a.recoverable),
  );
}

/**
 * The recover-nested tool's automatic search: token accounts owned by any of
 * the wallet's associated token accounts. The server's own RPC checks several
 * ATAs at once instead of the page's one-at-a-time pacing.
 */
export function createRpcNestedScan(rpcUrl: string): NestedScan {
  const rpc = createSolanaRpc(rpcUrl);
  return async (owner, abortSignal) => {
    const wallet = address(owner);
    const parents = await filterAssociatedTokenAccounts(
      await fetchTokenAccountsByOwner(rpc, wallet, { abortSignal }),
      wallet,
    );
    if (parents.length > NESTED_PARENT_LIMIT) throw new NestedScanLimitError();
    const pairs = await findNestedAta({
      rpc,
      walletAccounts: parents,
      concurrency: NESTED_CONCURRENCY,
      delayMs: 0,
      abortSignal,
    });
    const mintDecimals = await fetchMintDecimals(
      rpc,
      ordered(pairs)
        .slice(0, DETAIL_LIMIT)
        .map((p) => p.nested.data.mint),
      abortSignal,
    );
    return { parentCount: parents.length, pairs, mintDecimals };
  };
}

export function summarizeNested(
  address: string,
  { parentCount, pairs, mintDecimals }: NestedScanResult,
) {
  const sorted = ordered(pairs);
  const recoverable = pairs.filter((p) => p.recoverable);
  const recoverableRent = recoverable.reduce(
    (sum, p) => sum + p.nested.lamports,
    0n,
  );
  return {
    address,
    network: "mainnet-beta" as const,
    scannedAt: new Date().toISOString(),
    checkedAssociatedTokenAccountCount: parentCount,
    nestedAccountCount: pairs.length,
    recoverableAccountCount: recoverable.length,
    recoverableRentLamports: recoverableRent.toString(),
    recoverableRentSol: solString(recoverableRent),
    accounts: sorted.slice(0, DETAIL_LIMIT).map(({ parent, nested, ...p }) => {
      const decimals = mintDecimals[nested.data.mint];
      return {
        nestedAccount: nested.address,
        nestedMint: nested.data.mint,
        parentAccount: parent.address,
        parentMint: parent.data.mint,
        program:
          nested.programAddress === TOKEN_PROGRAM_ADDRESS
            ? ("token" as const)
            : ("token-2022" as const),
        tokenBalance: {
          raw: nested.data.amount.toString(),
          ...(decimals === undefined
            ? {}
            : { amount: formatTokenAmount(nested.data.amount, decimals) }),
        },
        rentLamports: nested.lamports.toString(),
        recoverable: p.recoverable,
      };
    }),
    accountsTruncated: pairs.length > DETAIL_LIMIT,
    recoverUrl: RECOVER_NESTED_URL,
    notes: [
      "This is a read-only check of public mainnet data. No wallet was connected and no transaction was created or sent.",
      "A nested token account is owned by one of the wallet's associated token accounts instead of by the wallet, usually because tokens were sent to a token account address as if it were a wallet. Its tokens stay stuck until recovered.",
      "A nested account is recoverable when it is the associated token account of its parent for the same token program. Recovery moves its tokens to the wallet's own associated token account and returns its rent to the wallet. Other nested accounts cannot be recovered this way.",
      "Only the wallet's associated token accounts are checked as parents, like the BlastCtrl tool's automatic search.",
      "To recover, open the BlastCtrl recover nested tool, connect this address, and run the automatic search there. The page does not read an address from this link.",
    ],
  };
}
