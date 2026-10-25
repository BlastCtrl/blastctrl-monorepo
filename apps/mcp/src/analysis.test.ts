import { afterEach, expect, it, vi } from "vitest";
import { createRpcScan, summarize } from "./analysis";
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
  expect(result.ifAccountsKeptOpen.estimatedServiceFeeLamports).toBe("3");
  expect(result.estimate.estimatedServiceFeeLamports).toBe("2");
});

it("scans both token programs and ties every RPC request to the deadline signal", async () => {
  const controller = new AbortController();
  const methods: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      // Kit coalesces requests behind a signal of its own, so the link to
      // the deadline is checked by aborting it, in the next test.
      expect(options.signal).toBeInstanceOf(AbortSignal);
      const request = JSON.parse(options.body as string) as {
        id: string;
        method: string;
      };
      methods.push(request.method);
      const result = { context: { slot: 1 }, value: [] };
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
        { status: 200 },
      );
    }),
  );
  expect(
    await createRpcScan("https://rpc.example")(
      "11111111111111111111111111111111",
      controller.signal,
    ),
  ).toEqual([]);
  expect(methods).toEqual([
    "getTokenAccountsByOwner",
    "getTokenAccountsByOwner",
  ]);
});

it("aborts the RPC request in flight when the deadline signal fires", async () => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options: RequestInit) => {
      requestSignal = options.signal ?? undefined;
      // Like a real fetch: pending until its signal aborts.
      return new Promise<Response>((_, reject) =>
        requestSignal?.addEventListener("abort", () =>
          reject(requestSignal?.reason),
        ),
      );
    }),
  );
  setTimeout(() => controller.abort(new Error("deadline")), 5);
  await expect(
    createRpcScan("https://rpc.example")(
      "11111111111111111111111111111111",
      controller.signal,
    ),
  ).rejects.toThrow("deadline");
  await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true));
});
