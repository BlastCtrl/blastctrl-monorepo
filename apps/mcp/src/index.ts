import { createRpcScan } from "./analysis";
import { readConfig } from "./config";
import { createHttpServer } from "./http";

const config = readConfig(process.env);
const server = createHttpServer({
  scan: createRpcScan(config.RPC_ENDPOINT),
  serviceFeeBasisPoints: config.RECLAIM_RENT_FEE_BPS,
  publicOrigin: config.PUBLIC_ORIGIN,
});
server.listen(config.PORT, config.HOST, () => {
  console.log(`BlastCtrl MCP listening on ${config.HOST}:${config.PORT}/mcp`);
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
