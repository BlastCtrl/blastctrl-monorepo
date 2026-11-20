import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type Scans } from "./server";

type AnyScan = (address: string, signal: AbortSignal) => Promise<unknown>;
type Limited<S extends Record<string, AnyScan>> = {
  [K in keyof S]: (address: string, signal: AbortSignal) => ReturnType<S[K]>;
};

/**
 * A small per-process budget for the first deployment, shared across clients
 * and across every scan in `scans`.
 */
export function limitScans<S extends Record<string, AnyScan>>(
  scans: S,
  now = Date.now,
): Limited<S> {
  let windowStart = now();
  let requests = 0;
  let active = 0;
  const limit =
    <T>(scan: (address: string, signal: AbortSignal) => Promise<T>) =>
    async (address: string, signal: AbortSignal): Promise<T> => {
      if (now() - windowStart >= 60_000) {
        windowStart = now();
        requests = 0;
      }
      if (requests >= 30 || active >= 4)
        throw new Error("Scan capacity reached");
      requests++;
      active++;
      try {
        return await scan(address, signal);
      } finally {
        active--;
      }
    };
  return Object.fromEntries(
    Object.entries(scans).map(([name, scan]) => [name, limit(scan)]),
  ) as Limited<S>;
}

export function createHttpServer({
  scans,
  serviceFeeBasisPoints,
  publicOrigin,
  publicHosts = [],
}: {
  scans: Scans;
  serviceFeeBasisPoints: number;
  publicOrigin?: string;
  /** Further Host headers to accept, e.g. the Vercel deployment's domains. */
  publicHosts?: string[];
}) {
  const limited = limitScans({
    rent: scans.rent,
    delegations: scans.delegations,
    nested: scans.nested,
  });
  const allowedOrigins = new Set([
    "http://localhost:6274",
    "http://127.0.0.1:6274",
  ]);
  if (publicOrigin) allowedOrigins.add(publicOrigin);
  const allowedHosts = new Set(publicHosts);
  if (publicOrigin) allowedHosts.add(new URL(publicOrigin).host);
  return createServer(
    { requestTimeout: 30_000, headersTimeout: 10_000 },
    async (req, res) => {
      // Browser requests require an allowed Origin. ChatGPT calls server-to-server.
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) {
        res.writeHead(403).end("Origin not allowed");
        return;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      const host = req.headers.host;
      const allowedHost =
        host &&
        (/^localhost:\d+$/.test(host) ||
          /^127\.0\.0\.1:\d+$/.test(host) ||
          allowedHosts.has(host));
      if (!allowedHost) {
        res.writeHead(403).end("Host not allowed");
        return;
      }
      const path = req.url?.split("?")[0];
      if (path === "/health" && req.method === "GET") {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end('{"status":"ok"}');
        return;
      }
      if (path !== "/mcp") {
        res.writeHead(404).end("Not found");
        return;
      }
      if (req.method === "OPTIONS") {
        res
          .writeHead(204, {
            "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept",
            "Access-Control-Expose-Headers": "MCP-Session-Id",
          })
          .end();
        return;
      }
      const controller = new AbortController();
      // Every scan also stops when the client goes away.
      const withClose =
        <T>(scan: (address: string, signal: AbortSignal) => Promise<T>) =>
        (address: string, signal: AbortSignal) =>
          scan(address, AbortSignal.any([signal, controller.signal]));
      const server = createMcpServer({
        scans: {
          rent: withClose(limited.rent),
          delegations: withClose(limited.delegations),
          nested: withClose(limited.nested),
          // Not in the scan budget: everyone shares one cached RPC read.
          rentStatus: (signal) =>
            scans.rentStatus(AbortSignal.any([signal, controller.signal])),
        },
        serviceFeeBasisPoints,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 16_384,
      });
      res.on("close", () => {
        controller.abort();
        void server.close().catch(() => {});
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch {
        // Never log provider errors or addresses here.
        if (!res.headersSent) res.writeHead(500).end("MCP request failed");
        else res.end();
      }
    },
  );
}
