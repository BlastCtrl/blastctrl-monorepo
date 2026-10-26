import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isAddress } from "@solana/kit";
import { z } from "zod";
import { ScanLimitError } from "@blastctrl/rent-reclaimer";
import { SCAN_TIMEOUT_MS, summarize } from "./analysis";
import type { Scan } from "./analysis";
import { summarizeDelegations, type DelegationScan } from "./delegations";
import {
  NestedScanLimitError,
  summarizeNested,
  type NestedScan,
} from "./nested";
import {
  describeRentStatus,
  summarizeRentStatus,
  type RentStatusScan,
} from "./rent-status";

export type Scans = {
  rent: Scan;
  delegations: DelegationScan;
  nested: NestedScan;
  rentStatus: RentStatusScan;
};

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

const tokenAmount = z.object({
  raw: z.string(),
  amount: z.string().optional(),
});

const addressSchema = z
  .string()
  .trim()
  .refine(isAddress, "Supply a valid Solana address");

const readOnly = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true,
  },
  _meta: { securitySchemes: [{ type: "noauth" }] },
};

/**
 * Runs one scan under the request's signal and the deadline. Errors become a
 * fixed message: RPC errors can contain provider URLs and API keys.
 */
async function runScan<T>(
  requestSignal: AbortSignal,
  timeoutMs: number,
  scan: (signal: AbortSignal) => Promise<T>,
  respond: (value: T) => CallToolResult,
  nothingReturned: string,
): Promise<CallToolResult> {
  const signal = AbortSignal.any([
    requestSignal,
    AbortSignal.timeout(timeoutMs),
  ]);
  try {
    const value = await scan(signal);
    signal.throwIfAborted();
    return respond(value);
  } catch (error) {
    const message =
      error instanceof ScanLimitError || error instanceof NestedScanLimitError
        ? error.message
        : signal.aborted
          ? `The scan timed out or was cancelled. ${nothingReturned} Try again.`
          : `The scan could not be completed. ${nothingReturned} Try again later.`;
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export function createMcpServer({
  scans,
  serviceFeeBasisPoints,
  timeoutMs = SCAN_TIMEOUT_MS,
}: {
  scans: Scans;
  serviceFeeBasisPoints: number;
  timeoutMs?: number;
}) {
  const server = new McpServer({ name: "blastctrl", version: "0.1.0" });
  server.registerTool(
    "analyze_rent_reclaim",
    {
      title: "Analyze reclaimable Solana rent",
      description:
        "Check a supplied Solana address on mainnet for excess rent in SPL Token and Token-2022 accounts and referenced controlled mints. The estimate assumes eligible empty token accounts are closed, as the BlastCtrl reclaim page does. Returns fee estimates, account counts, and a BlastCtrl link. Read-only; does not connect a wallet, build, sign, or submit transactions. Does not discover all controlled mints or support multisig execution.",
      inputSchema: { address: addressSchema },
      outputSchema: {
        address: z.string(),
        network: z.literal("mainnet-beta"),
        scannedAt: z.string(),
        serviceFeeBasisPoints: z.number().int(),
        scannedAccountCount: z.number().int(),
        excludedAccountCount: z.number().int(),
        estimate: quoteSchema,
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
      ...readOnly,
    },
    async ({ address }, extra) =>
      runScan(
        extra.signal,
        timeoutMs,
        (signal) => scans.rent(address, signal),
        (accounts) => {
          const result = summarize(address, accounts, serviceFeeBasisPoints);
          return {
            structuredContent: result,
            content: [
              {
                type: "text",
                text: `Address: ${address} (mainnet-beta). Reclaimable, closing ${result.estimate.closedAccountCount} empty accounts: ${result.estimate.grossSol} SOL before fees; estimated net ${result.estimate.estimatedNetSol} SOL. Scanned ${result.scannedAccountCount} accounts. ${result.notes.join(" ")} Open BlastCtrl: ${result.reclaimUrl}`,
              },
            ],
          };
        },
        "No estimate was returned.",
      ),
  );

  server.registerTool(
    "check_token_delegations",
    {
      title: "Check Solana token delegations",
      description:
        "Check a supplied Solana address on mainnet for SPL Token and Token-2022 accounts with an active delegate, an address allowed to transfer tokens out of the account without the owner. Returns each delegate, the delegated amount and the account balance, and a link to the BlastCtrl tool that revokes delegations. Read-only; does not connect a wallet, build, sign, or submit transactions, and does not revoke anything.",
      inputSchema: { address: addressSchema },
      outputSchema: {
        address: z.string(),
        network: z.literal("mainnet-beta"),
        scannedAt: z.string(),
        delegatedAccountCount: z.number().int(),
        accounts: z.array(
          z.object({
            tokenAccount: z.string(),
            mint: z.string(),
            program: z.enum(["token", "token-2022"]),
            delegate: z.string(),
            delegatedAmount: tokenAmount,
            balance: tokenAmount,
            unlimited: z.boolean(),
            coversWholeBalance: z.boolean(),
            frozen: z.boolean(),
          }),
        ),
        accountsTruncated: z.boolean(),
        revokeUrl: z.string(),
        notes: z.array(z.string()),
      },
      ...readOnly,
    },
    async ({ address }, extra) =>
      runScan(
        extra.signal,
        timeoutMs,
        (signal) => scans.delegations(address, signal),
        (scan) => {
          const result = summarizeDelegations(address, scan);
          const found =
            result.delegatedAccountCount === 0
              ? "No token accounts with an active delegate were found."
              : `Found ${result.delegatedAccountCount} token accounts with an active delegate.`;
          return {
            structuredContent: result,
            content: [
              {
                type: "text",
                text: `Address: ${address} (mainnet-beta). ${found} ${result.notes.join(" ")} Revoke in BlastCtrl: ${result.revokeUrl}`,
              },
            ],
          };
        },
        "No result was returned.",
      ),
  );

  server.registerTool(
    "check_nested_token_accounts",
    {
      title: "Check nested Solana token accounts",
      description:
        "Check a supplied Solana address on mainnet for nested token accounts: SPL Token or Token-2022 accounts owned by one of the wallet's associated token accounts instead of by the wallet, whose tokens are stuck until recovered. Returns each nested account, whether it can be recovered, the rent it holds, and a link to the BlastCtrl tool that recovers them. Read-only; does not connect a wallet, build, sign, or submit transactions, and does not recover anything.",
      inputSchema: { address: addressSchema },
      outputSchema: {
        address: z.string(),
        network: z.literal("mainnet-beta"),
        scannedAt: z.string(),
        checkedAssociatedTokenAccountCount: z.number().int(),
        nestedAccountCount: z.number().int(),
        recoverableAccountCount: z.number().int(),
        recoverableRentLamports: lamports,
        recoverableRentSol: z.string(),
        accounts: z.array(
          z.object({
            nestedAccount: z.string(),
            nestedMint: z.string(),
            parentAccount: z.string(),
            parentMint: z.string(),
            program: z.enum(["token", "token-2022"]),
            tokenBalance: tokenAmount,
            rentLamports: lamports,
            recoverable: z.boolean(),
          }),
        ),
        accountsTruncated: z.boolean(),
        recoverUrl: z.string(),
        notes: z.array(z.string()),
      },
      ...readOnly,
    },
    async ({ address }, extra) =>
      runScan(
        extra.signal,
        timeoutMs,
        (signal) => scans.nested(address, signal),
        (scan) => {
          const result = summarizeNested(address, scan);
          const found =
            result.nestedAccountCount === 0
              ? `No nested token accounts were found under its ${result.checkedAssociatedTokenAccountCount} associated token accounts.`
              : `Found ${result.nestedAccountCount} nested token accounts, ${result.recoverableAccountCount} recoverable, holding ${result.recoverableRentSol} SOL of recoverable rent.`;
          return {
            structuredContent: result,
            content: [
              {
                type: "text",
                text: `Address: ${address} (mainnet-beta). ${found} ${result.notes.join(" ")} Recover in BlastCtrl: ${result.recoverUrl}`,
              },
            ],
          };
        },
        "No result was returned.",
      ),
  );

  server.registerTool(
    "check_rent_reduction_status",
    {
      title: "Check Solana rent reduction status",
      description:
        "Check which steps of Solana's SIMD-0437 rent reduction are live on mainnet by reading their feature gate accounts, with each step's activation slot and date, the current rent-exempt cost of a token account, and the excess rent an account opened before the cuts now holds. Use it to tell whether more rent reduction has landed since a previous check. When steps are still pending, it suggests checking again after the earliest activation date. Read-only; takes no address.",
      outputSchema: {
        network: z.literal("mainnet-beta"),
        checkedAt: z.string(),
        slot: z.string(),
        epoch: z.string(),
        latestActiveStep: z.number().int(),
        moreReductionPending: z.boolean(),
        current: z.object({
          lamportsPerByte: z.number().int(),
          reductionPercent: z.number().int(),
          tokenAccountRentLamports: lamports,
          tokenAccountRentSol: z.string(),
        }),
        steps: z.array(
          z.object({
            step: z.number().int(),
            simd: z.string(),
            featureId: z.string(),
            status: z.enum(["active", "scheduled", "not-scheduled"]),
            lamportsPerByte: z.number().int(),
            reductionPercent: z.number().int(),
            tokenAccountRentLamports: lamports,
            activationSlot: z.string().optional(),
            activatedAt: z.string().optional(),
            expectedActivationAt: z.string().optional(),
          }),
        ),
        legacyTokenAccount: z.object({
          depositLamports: lamports,
          excessNowLamports: lamports,
          excessNowSol: z.string(),
          excessAfterAllStepsLamports: lamports,
          excessAfterAllStepsSol: z.string(),
        }),
        nextStep: z
          .object({
            step: z.number().int(),
            status: z.enum(["scheduled", "not-scheduled"]),
            earliestActivationDate: z.string(),
            expectedActivationAt: z.string().optional(),
          })
          .optional(),
        reclaimUrl: z.string(),
        suggestion: z.string(),
        notes: z.array(z.string()),
      },
      ...readOnly,
    },
    async (extra) =>
      runScan(
        extra.signal,
        timeoutMs,
        (signal) => scans.rentStatus(signal),
        (scan) => {
          const result = summarizeRentStatus(scan);
          return {
            structuredContent: result,
            content: [{ type: "text", text: describeRentStatus(result) }],
          };
        },
        "No status was returned.",
      ),
  );
  return server;
}
