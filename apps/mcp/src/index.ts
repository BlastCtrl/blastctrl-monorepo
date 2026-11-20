import { track } from "@vercel/analytics/server";
import { createRpcScan } from "./analysis";
import { publicHosts, readConfig } from "./config";
import { createRpcDelegationScan } from "./delegations";
import { createHttpServer } from "./http";
import { createRpcNestedScan } from "./nested";

const config = readConfig(process.env);
const server = createHttpServer({
  scans: {
    rent: createRpcScan(config.RPC_ENDPOINT),
    delegations: createRpcDelegationScan(config.RPC_ENDPOINT),
    nested: createRpcNestedScan(config.RPC_ENDPOINT),
  },
  serviceFeeBasisPoints: config.RECLAIM_RENT_FEE_BPS,
  publicOrigin: config.PUBLIC_ORIGIN,
  publicHosts: publicHosts(config),
  // Vercel Web Analytics custom event, from the production deployment only.
  // The plan allows two properties, and the address is never one of them.
  // The two headers are what the event endpoint takes from a server.
  onToolCall:
    config.VERCEL_ENV === "production"
      ? (tool, outcome, headers) =>
          void track(
            "mcp_tool_call",
            { tool, outcome },
            {
              headers: {
                "user-agent": headers["user-agent"],
                "x-forwarded-for": headers["x-forwarded-for"],
              },
            },
          ).catch(() => {})
      : undefined,
});
// On Vercel the runtime takes the server from this call and routes requests
// to it itself, so HOST and PORT only matter when running it directly.
server.listen(config.PORT, config.HOST, () => {
  console.log(`BlastCtrl MCP listening on ${config.HOST}:${config.PORT}/mcp`);
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
