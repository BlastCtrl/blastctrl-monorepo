export type TokenProgram = "token" | "token-2022";

export type ReclaimableAccount = {
  id: string;
  kind: "token-account" | "mint";
  address: string;
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  program: TokenProgram;
  tokenBalance: string;
  isEmpty: boolean;
  dataLength: number;
  /** What the account holds. */
  lamports: number;
  /** Rent-exempt minimum for its size, from the RPC. */
  minimum: number;
  blockedReason?: string;
  /**
   * Why an empty token account can't be closed by the wallet, so it only
   * gives up its excess even when closing empty accounts is on.
   */
  keepOpenReason?: string;
};

export function excessLamports(account: ReclaimableAccount) {
  if (account.blockedReason) return 0;
  return Math.max(0, account.lamports - account.minimum);
}

/**
 * Whether reclaiming closes this account instead of withdrawing its excess:
 * an empty token account the wallet is free to close, with closing on.
 */
export function closes(account: ReclaimableAccount, closeEmpty: boolean) {
  return (
    closeEmpty &&
    account.kind === "token-account" &&
    account.isEmpty &&
    !account.blockedReason &&
    !account.keepOpenReason
  );
}

/**
 * What reclaiming this account returns: everything it holds when it gets
 * closed, otherwise only the excess.
 */
export function reclaimLamports(
  account: ReclaimableAccount,
  closeEmpty: boolean,
) {
  return closes(account, closeEmpty)
    ? account.lamports
    : excessLamports(account);
}

export type MintLookup =
  | { status: "ok"; account: ReclaimableAccount }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" }
  | { status: "not-found" };
