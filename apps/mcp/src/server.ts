import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAddress } from "@solana/kit";
import { z } from "zod";
import { ScanLimitError } from "@blastctrl/rent-reclaimer";
import { SCAN_TIMEOUT_MS, summarize } from "./analysis";
import type { Scan } from "./analysis";

const lamports = z.string().regex(/^-?\d+$/);
const quoteSchema = z.object({
  closeEmptyAccounts: z.boolean(),
  accountCount: z.number().int(),
  tokenAccountCount: z.number().int(),
  mintCount: z.number().int(),
  closedAccountCount: z.number().int(),
  estimatedTransactionCount: z.number().int(),
  excessLamports: lamports,
  additionalClosureLamports: lamports,
  grossLamports: lamports,
  grossSol: z.string(),
  estimatedServiceFeeLamports: lamports,
  estimatedNetworkFeeLamports: lamports,
  estimatedNetLamports: lamports,
  estimatedNetSol: z.string(),
  feesExceedReclaim: z.boolean(),
});

const addressSchema = z
  .string()
  .trim()
  .refine(isAddress, "Supply a valid Solana address");

export function createMcpServer({
  scan,
  serviceFeeBasisPoints,
  timeoutMs = SCAN_TIMEOUT_MS,
}: {
  scan: Scan;
  serviceFeeBasisPoints: number;
  timeoutMs?: number;
}) {
  const server = new McpServer({ name: "blastctrl", version: "0.1.0" });
  server.registerTool(
    "analyze_rent_reclaim",
    {
      title: "Analyze reclaimable Solana rent",
      description:
        "Check a supplied Solana address on mainnet for excess rent in SPL Token and Token-2022 accounts and referenced controlled mints. Returns separate estimates with and without empty-account closures, fee estimates, account counts, and a BlastCtrl link. Read-only; does not connect a wallet, build, sign, or submit transactions. Does not discover all controlled mints or support multisig execution.",
      inputSchema: { address: addressSchema },
      outputSchema: {
        address: z.string(),
        network: z.literal("mainnet-beta"),
        scannedAt: z.string(),
        serviceFeeBasisPoints: z.number().int(),
        scannedAccountCount: z.number().int(),
        excludedAccountCount: z.number().int(),
        keepAccountsOpen: quoteSchema,
        closeEmptyAccounts: quoteSchema,
        accountSummary: z.array(
          z.object({
            address: z.string(),
            mint: z.string(),
            kind: z.enum(["token-account", "mint"]),
            program: z.enum(["token", "token-2022"]),
            excessLamports: lamports,
            canCloseEmptyAccount: z.boolean(),
            excludedReason: z.string().optional(),
            keepOpenReason: z.string().optional(),
          }),
        ),
        accountSummaryTruncated: z.boolean(),
        relevantAccountCount: z.number().int(),
        reclaimUrl: z.string(),
        notes: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
      _meta: { securitySchemes: [{ type: "noauth" }] },
    },
    async ({ address }, extra) => {
      const signal = AbortSignal.any([
        extra.signal,
        AbortSignal.timeout(timeoutMs),
      ]);
      try {
        const accounts = await scan(address, signal);
        signal.throwIfAborted();
        const result = summarize(address, accounts, serviceFeeBasisPoints);
        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Address: ${address} (mainnet-beta). Excess rent with accounts kept open: ${result.keepAccountsOpen.grossSol} SOL before fees; estimated net ${result.keepAccountsOpen.estimatedNetSol} SOL. Including eligible empty-account closures: ${result.closeEmptyAccounts.grossSol} SOL before fees; estimated net ${result.closeEmptyAccounts.estimatedNetSol} SOL. Scanned ${result.scannedAccountCount} accounts. ${result.notes.join(" ")} Open BlastCtrl: ${result.reclaimUrl}`,
            },
          ],
        };
      } catch (error) {
        // RPC errors can contain provider URLs and API keys. Never return them.
        const message =
          error instanceof ScanLimitError
            ? error.message
            : signal.aborted
              ? "The scan timed out or was cancelled. No estimate was returned. Try again."
              : "The scan could not be completed. No estimate was returned. Try again later.";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    },
  );
  return server;
}
