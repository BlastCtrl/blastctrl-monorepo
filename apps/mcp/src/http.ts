import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import type { Scan } from "./analysis.js";

/** A small per-process budget for the first deployment, shared across clients. */
export function limitScans(scan: Scan, now = Date.now): Scan {
  let windowStart = now();
  let requests = 0;
  let active = 0;
  return async (address, signal) => {
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      requests = 0;
    }
    if (requests >= 30 || active >= 4) throw new Error("Scan capacity reached");
    requests++;
    active++;
    try {
      return await scan(address, signal);
    } finally {
      active--;
    }
  };
}

export function createHttpServer({
  scan,
  serviceFeeBasisPoints,
  publicOrigin,
}: {
  scan: Scan;
  serviceFeeBasisPoints: number;
  publicOrigin?: string;
}) {
  const limitedScan = limitScans(scan);
  const allowedOrigins = new Set([
    "http://localhost:6274",
    "http://127.0.0.1:6274",
  ]);
  if (publicOrigin) allowedOrigins.add(publicOrigin);
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
          (publicOrigin && host === new URL(publicOrigin).host));
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
      const server = createMcpServer({
        scan: (address, signal) =>
          limitedScan(address, AbortSignal.any([signal, controller.signal])),
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
