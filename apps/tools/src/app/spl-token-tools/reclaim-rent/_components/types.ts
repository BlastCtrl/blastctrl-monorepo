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
};

export function excessLamports(account: ReclaimableAccount) {
  if (account.blockedReason) return 0;
  return Math.max(0, account.lamports - account.minimum);
}

export type MintLookup =
  | { status: "ok"; account: ReclaimableAccount }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" }
  | { status: "not-found" };
