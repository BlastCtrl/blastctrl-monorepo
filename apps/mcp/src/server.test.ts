import { once } from "node:events";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredAccount } from "@blastctrl/rent-reclaimer";
import { ScanLimitError } from "@blastctrl/rent-reclaimer";
import { createHttpServer, limitScans } from "./http";
import { summarize } from "./analysis";
import type { Scan } from "./analysis";
import { readConfig } from "./config";
import { createMcpServer } from "./server";

const address = "11111111111111111111111111111111";
const account: DiscoveredAccount = {
  id: address,
  address,
  mint: address,
  kind: "token-account",
  program: "token",
  tokenBalance: "0",
  isEmpty: true,
  dataLength: 165,
  lamports: 2_039_280,
  minimum: 1_488_440,
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function connect(scan: Scan) {
  const server = createHttpServer({ scan, serviceFeeBasisPoints: 500 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = new URL(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,
  );
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const client = new Client({ name: "blastctrl-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url));
  cleanups.push(() => client.close());
  return { client, url };
}

describe("MCP over real local HTTP", () => {
  it("initializes, lists one read-only tool, and returns both quotes and the web link", async () => {
    const scan = vi.fn<Scan>().mockResolvedValue([account]);
    const { client } = await connect(scan);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "analyze_rent_reclaim",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    });
    const result = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      address,
      network: "mainnet-beta",
      scannedAccountCount: 1,
      ifAccountsKeptOpen: {
        grossLamports: "550840",
        estimatedNetLamports: "518298",
      },
      estimate: {
        grossLamports: "2039280",
        estimatedNetLamports: "2006738",
      },
      reclaimUrl: "https://reclaim.blastctrl.com",
    });
    expect(scan.mock.calls[0]![0]).toBe(address);
  });

  it("rejects malformed addresses before it calls the RPC scanner", async () => {
    const scan = vi.fn<Scan>().mockResolvedValue([]);
    const { client } = await connect(scan);
    const result = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address: "not an address" },
    });
    expect(result.isError).toBe(true);
    expect(scan).not.toHaveBeenCalled();
  });

  it("distinguishes an empty successful scan from failure and hides RPC secrets", async () => {
    const scan = vi
      .fn<Scan>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("https://rpc.example/?api-key=SECRET"));
    const { client } = await connect(scan);
    const empty = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address },
    });
    expect(empty.structuredContent).toMatchObject({
      scannedAccountCount: 0,
      estimate: { estimatedNetLamports: "0" },
    });
    const failure = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address },
    });
    expect(failure.isError).toBe(true);
    expect(failure.structuredContent).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain("SECRET");
    expect(JSON.stringify(failure)).toContain("No estimate was returned");
  });

  it("returns an explicit scan limit error instead of a partial estimate", async () => {
    const { client } = await connect(async () => {
      throw new ScanLimitError();
    });
    const result = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("too many token accounts");
  });

  it("checks host and origin, provides health, and limits request body size", async () => {
    const { url } = await connect(async () => []);
    expect((await fetch(new URL("/health", url))).status).toBe(200);
    expect(
      (await fetch(url, { headers: { Origin: "https://untrusted.example" } }))
        .status,
    ).toBe(403);
    // Node fetch ignores a custom Host header; use the HTTP client for this check.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(url, { headers: { Host: "untrusted.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", reject);
    });
    expect(status).toBe(403);
    expect(
      (
        await fetch(url, {
          method: "OPTIONS",
          headers: { Origin: "http://localhost:6274" },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ padding: "x".repeat(20_000) }),
        })
      ).status,
    ).toBe(413);
  });
});

describe("limits and configuration", () => {
  it("aborts a timed-out scan and returns no quote", async () => {
    let signal: AbortSignal | undefined;
    const server = createMcpServer({
      serviceFeeBasisPoints: 0,
      timeoutMs: 10,
      scan: async (_, scanSignal) => {
        signal = scanSignal;
        return new Promise((_, reject) => {
          scanSignal.addEventListener(
            "abort",
            () => reject(scanSignal.reason),
            { once: true },
          );
        });
      },
    });
    const client = new Client({ name: "timeout-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanups.push(
      () => server.close(),
      () => client.close(),
    );
    const result = await client.callTool({
      name: "analyze_rent_reclaim",
      arguments: { address },
    });
    expect(signal?.aborted).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).toContain("timed out");
  });
  it("limits the displayed account list without truncating totals", () => {
    const result = summarize(
      address,
      Array.from({ length: 25 }, () => account),
      0,
    );
    expect(result.accountSummary).toHaveLength(20);
    expect(result.accountSummaryTruncated).toBe(true);
    expect(result.estimate.accountCount).toBe(25);
    expect(result.estimate.grossLamports).toBe("50982000");
  });

  it("bounds concurrency and releases capacity after failures", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scan = vi.fn<Scan>().mockImplementation(async () => {
      await pending;
      throw new Error("RPC failure");
    });
    const limited = limitScans(scan);
    const signal = new AbortController().signal;
    const results = Promise.allSettled(
      Array.from({ length: 4 }, () => limited(address, signal)),
    );
    await expect(limited(address, signal)).rejects.toThrow("capacity");
    release();
    await results;
    scan.mockResolvedValue([]);
    expect(await limited(address, signal)).toEqual([]);
  });

  it("shares the request budget and resets it after a minute", async () => {
    let time = 0;
    const limited = limitScans(
      async () => [],
      () => time,
    );
    const signal = new AbortController().signal;
    for (let i = 0; i < 30; i++) await limited(address, signal);
    await expect(limited(address, signal)).rejects.toThrow("capacity");
    time = 60_000;
    expect(await limited(address, signal)).toEqual([]);
  });

  it("requires an explicit fee rate and never prints the RPC secret in config errors", () => {
    expect(() =>
      readConfig({ RPC_ENDPOINT: "https://rpc.example/?api-key=SECRET" }),
    ).toThrow("RECLAIM_RENT_FEE_BPS");
    expect(() =>
      readConfig({ RPC_ENDPOINT: "https://rpc.example/?api-key=SECRET" }),
    ).not.toThrow("SECRET");
    expect(
      readConfig({
        RPC_ENDPOINT: "https://rpc.example",
        RECLAIM_RENT_FEE_BPS: "500",
      }),
    ).toMatchObject({ RECLAIM_RENT_FEE_BPS: 500, HOST: "127.0.0.1" });
  });
});
