import type { ReclaimableAccount } from "../_components/types";
import {
  MOCK_AT_MINIMUM,
  MOCK_MINTS,
  MOCK_TOKEN_ACCOUNTS,
} from "../demo/mock-data";

/**
 * The real-data states a final design has to handle, as mock wallets. The
 * default is the owner's wallet from `demo/mock-data.ts`.
 */
export const PRESETS = [
  { id: "default", name: "18 accounts" },
  { id: "none", name: "Nothing selected" },
  { id: "mints", name: "Only mints" },
  { id: "tokens", name: "Only token accounts" },
  { id: "many", name: "120 accounts, 6 transactions" },
  { id: "dust", name: "Fees larger than the excess" },
  { id: "nothing", name: "Nothing to reclaim" },
  { id: "done", name: "After a reclaim" },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export type MockWallet = {
  tokenAccounts: ReclaimableAccount[];
  mints: ReclaimableAccount[];
  atMinimum: number;
  selectedIds: Set<string>;
  reclaimedIds: Set<string>;
};

const ids = (accounts: ReclaimableAccount[]) =>
  new Set(accounts.map((a) => a.id));

/** 118 token accounts: the owner's 16, repeated with new addresses. */
function manyTokenAccounts() {
  return Array.from({ length: 118 }, (_, i) => {
    const base = MOCK_TOKEN_ACCOUNTS[i % MOCK_TOKEN_ACCOUNTS.length]!;
    if (i < MOCK_TOKEN_ACCOUNTS.length) return base;
    const address = base.address.slice(0, 40) + String(1000 + i).slice(-4);
    return { ...base, id: address, address };
  });
}

/** One account a few thousand lamports over the minimum: less than a fee. */
function dustAccount(): ReclaimableAccount {
  const base = MOCK_TOKEN_ACCOUNTS[0]!;
  return { ...base, id: "dust", lamports: base.minimum + 3_000 };
}

export function mockWallet(id: PresetId): MockWallet {
  const tokens = MOCK_TOKEN_ACCOUNTS;
  const mints = MOCK_MINTS;
  const base = { atMinimum: MOCK_AT_MINIMUM, reclaimedIds: new Set<string>() };
  switch (id) {
    case "default":
      return {
        ...base,
        tokenAccounts: tokens,
        mints,
        selectedIds: ids([...tokens, ...mints]),
      };
    case "none":
      return { ...base, tokenAccounts: tokens, mints, selectedIds: new Set() };
    case "mints":
      return { ...base, tokenAccounts: tokens, mints, selectedIds: ids(mints) };
    case "tokens":
      return {
        ...base,
        tokenAccounts: tokens,
        mints,
        selectedIds: ids(tokens),
      };
    case "many": {
      const many = manyTokenAccounts();
      return {
        ...base,
        tokenAccounts: many,
        mints,
        selectedIds: ids([...many, ...mints]),
      };
    }
    case "dust": {
      const dust = [dustAccount()];
      return {
        ...base,
        atMinimum: tokens.length,
        tokenAccounts: dust,
        mints: [],
        selectedIds: ids(dust),
      };
    }
    case "nothing":
      return {
        ...base,
        atMinimum: tokens.length + 1,
        tokenAccounts: [],
        mints: [],
        selectedIds: new Set(),
      };
    case "done":
      return {
        ...base,
        tokenAccounts: tokens,
        mints,
        selectedIds: new Set(),
        reclaimedIds: ids([...tokens, ...mints]),
      };
  }
}
