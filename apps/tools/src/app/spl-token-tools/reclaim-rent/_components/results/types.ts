/**
 * What the results block has to say, in the order the page decides it:
 * nothing found, found but all reclaimed, nothing ticked, fees eat the
 * excess, or ready to go.
 */
export type RewardStatus =
  "nothing" | "reclaimed" | "none-selected" | "fees-exceed" | "ready";

/**
 * One account, as the coin row shows it: ticked or not, waiting on its
 * transaction to confirm, or reclaimed.
 */
export type CoinState = "selected" | "unselected" | "pending" | "confirmed";

export type Coin = {
  id: string;
  kind: "token-account" | "mint";
  state: CoinState;
};

/** A reclaim in flight: the wallet is asking, or the chain is confirming. */
export type Sending = {
  step: "signing" | "confirming";
  transactions: number;
  confirmed: number;
  /** For wallets that ask once per transaction: which one it's asking for. */
  prompt?: number;
};

export type RewardProps = {
  status: RewardStatus;
  /** Every account that has or had excess, token accounts first. */
  coins: Coin[];
  /** What lands in the wallet after network and service fees. */
  net: number;
  serviceFeeRate: string;
  tokenAccounts: number;
  mints: number;
  /** Token accounts the reclaim closes; for "reclaimed", the ones it closed. */
  emptyAccounts: number;
  transactions: number;
  /** For "reclaimed": what went back to the wallet. */
  reclaimed: number;
  reclaimedFrom: { tokenAccounts: number; mints: number };
  sending: Sending | null;
  /** The last send finished with some transactions failed. */
  failed: { transactions: number; of: number } | null;
  /** The wallet turned the request down; changes each time it happens. */
  rejectedAt: number | null;
  /**
   * When the refusal came partway through, from a wallet that asks per
   * transaction: how many had gone out before it.
   */
  cancelledAfter: { transactions: number; of: number } | null;
  /** Play the arrival on mount. False for later renders of the same results. */
  reveal: boolean;
  /** Skip every animation: the OS setting, or the demo's toggle. */
  reduced: boolean;
  onReclaim: () => void;
  onRescan: () => void;
  /**
   * The detailed view below the stage, where accounts get picked. Without
   * one (the /reclaim-sol page) there's nothing to customize, and no
   * "Customize".
   */
  details?: { id: string; open: boolean; onToggle: () => void };
};

export function fromWhere(tokenAccounts: number, mints: number) {
  const parts = [
    tokenAccounts > 0 &&
      `${tokenAccounts} token ${tokenAccounts === 1 ? "account" : "accounts"}`,
    mints > 0 && `${mints} ${mints === 1 ? "mint" : "mints"}`,
  ].filter(Boolean);
  return parts.join(" and ");
}

export function transactionCount(transactions: number) {
  return transactions === 1
    ? "One transaction"
    : `${transactions} transactions`;
}
