import type { DiscoveredAccount } from "./accounts";
import { closes, excessLamports, reclaimLamports } from "./accounts";

/**
 * Far below what fits in a transaction. Phantom adds a Lighthouse assertion
 * instruction for every account a transaction changes, but only when they all
 * fit. When they don't, it adds none and warns that the dApp could be
 * malicious. In testing, 12 token accounts and a mint got their assertions,
 * while 13 token accounts, or 12 that close, didn't.
 */
export const ACCOUNTS_PER_TRANSACTION = 10;
/** The base fee of a transaction with one signature; no priority fee. */
export const FEE_PER_TRANSACTION = 5000;

/** The fee on this much reclaimed excess, rounded down to whole lamports. */
export function serviceFeeLamports(
  excessLamports: number,
  basisPoints: number,
) {
  return Number((BigInt(excessLamports) * BigInt(basisPoints)) / 10_000n);
}

/**
 * The service fee of reclaiming these accounts in this order: one transfer
 * per transaction of {@link ACCOUNTS_PER_TRANSACTION}, each rounded down on
 * its own, the way the transfers are built.
 */
export function serviceFeeForBatches(
  accounts: DiscoveredAccount[],
  basisPoints: number,
) {
  let fee = 0n;
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_TRANSACTION) {
    const excess = accounts
      .slice(i, i + ACCOUNTS_PER_TRANSACTION)
      .reduce((sum, account) => sum + BigInt(excessLamports(account)), 0n);
    fee += (excess * BigInt(basisPoints)) / 10_000n;
  }
  return fee;
}

/** Exact decimal SOL for a signed lamport amount, all nine digits kept. */
export function solString(lamports: bigint) {
  const sign = lamports < 0n ? "-" : "";
  const value = lamports < 0n ? -lamports : lamports;
  return `${sign}${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, "0")}`;
}

export type ReclaimQuote = ReturnType<typeof quoteReclaim>;

/**
 * What reclaiming these accounts, in this order, would return: one scenario
 * of the web tool's preview, with or without closing empty accounts. The
 * amounts are decimal strings of integer lamports so nothing is rounded.
 */
export function quoteReclaim(
  accounts: DiscoveredAccount[],
  closeEmpty: boolean,
  basisPoints: number,
) {
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new Error("Invalid service fee rate");
  }
  for (const account of accounts) {
    if (
      ![account.lamports, account.minimum].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    ) {
      throw new Error("An account balance cannot be represented exactly");
    }
  }
  const eligible = accounts.filter(
    (a) => !a.blockedReason && reclaimLamports(a, closeEmpty) > 0,
  );
  const gross = eligible.reduce(
    (sum, a) => sum + BigInt(reclaimLamports(a, closeEmpty)),
    0n,
  );
  const excess = eligible.reduce(
    (sum, a) => sum + BigInt(excessLamports(a)),
    0n,
  );
  const transactions = Math.ceil(eligible.length / ACCOUNTS_PER_TRANSACTION);
  const serviceFee = serviceFeeForBatches(eligible, basisPoints);
  const networkFee = BigInt(transactions * FEE_PER_TRANSACTION);
  const net = gross - serviceFee - networkFee;
  return {
    closeEmptyAccounts: closeEmpty,
    accountCount: eligible.length,
    tokenAccountCount: eligible.filter((a) => a.kind === "token-account")
      .length,
    mintCount: eligible.filter((a) => a.kind === "mint").length,
    closedAccountCount: eligible.filter((a) => closes(a, closeEmpty)).length,
    estimatedTransactionCount: transactions,
    excessLamports: excess.toString(),
    additionalClosureLamports: (gross - excess).toString(),
    grossLamports: gross.toString(),
    grossSol: solString(gross),
    estimatedServiceFeeLamports: serviceFee.toString(),
    estimatedNetworkFeeLamports: networkFee.toString(),
    estimatedNetLamports: net.toString(),
    estimatedNetSol: solString(net),
    feesExceedReclaim: net <= 0n && eligible.length > 0,
  };
}
