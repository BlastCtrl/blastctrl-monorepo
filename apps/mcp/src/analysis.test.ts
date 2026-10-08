import { afterEach, expect, it, vi } from "vitest";
import { createRpcScan, summarize } from "./analysis.js";
import type { DiscoveredAccount } from "@blastctrl/rent-reclaimer";

afterEach(() => vi.unstubAllGlobals());

it("uses each scenario's web account order for per-batch fee rounding", () => {
  const accounts: DiscoveredAccount[] = Array.from({ length: 11 }, (_, i) => ({
    id: String(i),
    address: String(i),
    mint: "mint",
    kind: "token-account",
    program: "token",
    tokenBalance: "0",
    isEmpty: true,
    dataLength: 165,
    lamports: (i === 10 ? 0 : 100) + i + 1,
    minimum: i === 10 ? 0 : 100,
  }));
  const result = summarize("owner", accounts, 500);
  expect(result.keepAccountsOpen.estimatedServiceFeeLamports).toBe("3");
  expect(result.closeEmptyAccounts.estimatedServiceFeeLamports).toBe("2");
});

it("checks mainnet before discovery and passes the deadline signal to every RPC call", async () => {
  const signal = new AbortController().signal;
  const methods: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.signal).toBe(signal);
      const request = JSON.parse(options.body as string) as {
        id: string;
        method: string;
      };
      methods.push(request.method);
      const result =
        request.method === "getGenesisHash"
          ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
          : { context: { slot: 1 }, value: [] };
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
        { status: 200 },
      );
    }),
  );
  expect(
    await createRpcScan("https://rpc.example")(
      "11111111111111111111111111111111",
      signal,
    ),
  ).toEqual([]);
  expect(methods).toEqual([
    "getGenesisHash",
    "getTokenAccountsByOwner",
    "getTokenAccountsByOwner",
  ]);
});

it.each(["another-network", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"])(
  "rejects an incorrect genesis hash (%s) before it scans accounts",
  async (genesisHash) => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const request = JSON.parse(options.body as string) as { id: string };
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: genesisHash,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createRpcScan("https://rpc.example")(
        "11111111111111111111111111111111",
        new AbortController().signal,
      ),
    ).rejects.toThrow("not mainnet-beta");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
