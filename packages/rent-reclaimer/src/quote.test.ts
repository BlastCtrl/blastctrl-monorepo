import { describe, expect, it } from "vitest";
import type { DiscoveredAccount } from "./accounts";
import { quoteReclaim, solString } from "./quote";

const account = (
  overrides: Partial<DiscoveredAccount> = {},
): DiscoveredAccount => ({
  id: "account",
  address: "account",
  mint: "mint",
  kind: "token-account",
  program: "token",
  tokenBalance: "0",
  isEmpty: true,
  dataLength: 165,
  lamports: 2_039_280,
  minimum: 1_488_440,
  ...overrides,
});

describe("reclaim quotes", () => {
  it("separates excess from closure deposits and charges service fees only on excess", () => {
    const accounts = [account(), account({ isEmpty: false })];
    expect(quoteReclaim(accounts, false, 500)).toMatchObject({
      grossLamports: "1101680",
      additionalClosureLamports: "0",
      closedAccountCount: 0,
      estimatedServiceFeeLamports: "55084",
      estimatedNetworkFeeLamports: "5000",
      estimatedNetLamports: "1041596",
    });
    expect(quoteReclaim(accounts, true, 500)).toMatchObject({
      grossLamports: "2590120",
      excessLamports: "1101680",
      additionalClosureLamports: "1488440",
      closedAccountCount: 1,
      estimatedServiceFeeLamports: "55084",
      estimatedNetLamports: "2530036",
    });
  });

  it("preserves exclusions, closure restrictions, and mints", () => {
    const accounts = [
      account({ blockedReason: "Wrapped SOL" }),
      account({ keepOpenReason: "Other authority" }),
      account({ kind: "mint" }),
    ];
    expect(quoteReclaim(accounts, true, 0)).toMatchObject({
      accountCount: 2,
      closedAccountCount: 0,
      grossLamports: "1101680",
    });
  });

  it("rounds each transaction's service fee and adds a network fee for each batch", () => {
    const accounts = Array.from({ length: 11 }, () =>
      account({ lamports: 119, minimum: 100, isEmpty: false }),
    );
    expect(quoteReclaim(accounts, false, 500)).toMatchObject({
      estimatedTransactionCount: 2,
      estimatedServiceFeeLamports: "9",
      estimatedNetworkFeeLamports: "10000",
      estimatedNetLamports: "-9800",
      feesExceedReclaim: true,
    });
  });

  it("can close empty accounts at the minimum without charging an excess fee", () => {
    const accounts = [account({ lamports: 1_488_440 })];
    expect(quoteReclaim(accounts, false, 500)).toMatchObject({
      grossLamports: "0",
      estimatedNetLamports: "0",
      estimatedTransactionCount: 0,
    });
    expect(quoteReclaim(accounts, true, 500)).toMatchObject({
      grossLamports: "1488440",
      estimatedServiceFeeLamports: "0",
    });
  });

  it("keeps large totals exact and rejects balances already rounded by the RPC parser", () => {
    const accounts = [
      account({ lamports: Number.MAX_SAFE_INTEGER, minimum: 0 }),
      account({ lamports: Number.MAX_SAFE_INTEGER, minimum: 0 }),
    ];
    expect(quoteReclaim(accounts, false, 0).grossLamports).toBe(
      "18014398509481982",
    );
    expect(() =>
      quoteReclaim(
        [account({ lamports: Number.MAX_SAFE_INTEGER + 1 })],
        false,
        0,
      ),
    ).toThrow("exactly");
    expect(solString(-1n)).toBe("-0.000000001");
  });
});
