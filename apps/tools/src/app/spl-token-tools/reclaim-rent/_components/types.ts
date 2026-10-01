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
 * What the service fee is a share of: only the excess, even for accounts
 * that get closed and return their whole deposit.
 */
export const feeBase = (accounts: ReclaimableAccount[]) =>
  accounts.reduce((sum, a) => sum + excessLamports(a), 0);

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

/** The parts of a jsonParsed token account that decide whether it can close. */
export type ParsedTokenState = {
  state: string;
  closeAuthority?: string;
  /** Token-2022 only. */
  extensions?: { extension: string; state?: Record<string, unknown> }[];
};

/**
 * Why the owner couldn't close this token account even once it's empty.
 * Closing fails for the whole transaction, so anything doubtful stays open
 * and only gives up its excess.
 */
export function keepOpenReason(info: ParsedTokenState, owner: string) {
  if (info.state === "frozen") return "Frozen, so it stays open";
  if (info.closeAuthority && info.closeAuthority !== owner) {
    return "Only its close authority can close it";
  }
  for (const { extension, state } of info.extensions ?? []) {
    if (extension === "transferFeeAmount" && Number(state?.withheldAmount)) {
      return "Withheld transfer fees keep it open";
    }
    // Their balances are encrypted, so there's no telling they're empty.
    if (
      extension === "confidentialTransferAccount" ||
      extension === "confidentialTransferFeeAmount"
    ) {
      return "Confidential transfers keep it open";
    }
  }
  return undefined;
}

export type MintLookup =
  | { status: "ok"; account: ReclaimableAccount }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" }
  | { status: "not-found" };
