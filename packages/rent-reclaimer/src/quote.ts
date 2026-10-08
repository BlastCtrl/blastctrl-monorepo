import { closes, excessLamports, reclaimLamports } from "./types.js";
import type { DiscoveredAccount } from "./types.js";

// These are the existing web tool's batch size and base fee estimate.
export const ACCOUNTS_PER_TRANSACTION = 10;
export const FEE_PER_TRANSACTION = 5000;

/** Same fee rule as the web tool: a share of excess only, rounded down. */
export function serviceFeeLamports(excess: number, basisPoints: number) {
  return Number((BigInt(excess) * BigInt(basisPoints)) / 10_000n);
}

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

export function solString(lamports: bigint) {
  const sign = lamports < 0n ? "-" : "";
  const value = lamports < 0n ? -lamports : lamports;
  return `${sign}${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, "0")}`;
}

/** Preview only. Uses existing eligibility and account-return rules. */
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
