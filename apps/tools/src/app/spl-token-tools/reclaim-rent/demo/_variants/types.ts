export type VariantProps = {
  /** Excess rent in the selected accounts, before fees. */
  total: number;
  /** What lands in the wallet after network and service fees. */
  net: number;
  serviceFee: number;
  serviceFeeRate: string;
  networkFee: number;
  /** Rent all selected accounts hold right now, and what they must keep. */
  held: number;
  needed: number;
  tokenAccounts: number;
  mints: number;
  transactions: number;
  onReclaim: () => void;
  onRescan: () => void;
};

export function fromWhere({
  tokenAccounts,
  mints,
}: Pick<VariantProps, "tokenAccounts" | "mints">) {
  const parts = [
    tokenAccounts > 0 &&
      `${tokenAccounts} token ${tokenAccounts === 1 ? "account" : "accounts"}`,
    mints > 0 && `${mints} ${mints === 1 ? "mint" : "mints"}`,
  ].filter(Boolean);
  return parts.join(" and ");
}

export function count(n: number, noun: string) {
  return `${n === 1 ? "one" : n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Same as `count`, for the start of a sentence. */
export function Count(n: number, noun: string) {
  return `${n === 1 ? "One" : n} ${noun}${n === 1 ? "" : "s"}`;
}
