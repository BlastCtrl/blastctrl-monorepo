import type { DiscoveredAccount } from "@blastctrl/rent-reclaimer";

export {
  closes,
  excessLamports,
  feeBase,
  keepOpenReason,
  reclaimLamports,
  type ParsedTokenState,
  type TokenProgram,
} from "@blastctrl/rent-reclaimer";

/** A scanned account with what the table shows for its token, from DAS. */
export type ReclaimableAccount = DiscoveredAccount & {
  symbol: string;
  name: string;
  image?: string;
};

export type MintLookup =
  | { status: "ok"; account: ReclaimableAccount }
  | { status: "other-authority"; name: string; authority: string }
  | { status: "no-authority"; name: string }
  | { status: "not-a-mint" }
  | { status: "not-found" };
