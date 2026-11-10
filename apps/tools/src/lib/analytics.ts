import { track, type BeforeSendEvent } from "@vercel/analytics";

/**
 * Custom Vercel Analytics events. Each event carries at most two properties
 * (the Pro plan limit): the tool, as the page's path, and the kind of wallet,
 * as the connector's slug ("phantom", "solflare", "walletconnect"). Never an
 * address, signature, amount or anything else that identifies a user.
 *
 * Events are only sent on mainnet, so devnet and testnet testing stays out of
 * the numbers. In development `<Analytics />` logs them to the console
 * instead of sending them.
 */

type AnalyticsContext = { wallet: string; mainnet: boolean };

// Kept in sync with the connector by `AppAnalytics`; read at event time so
// call sites outside React (the RPC transport, batch senders) can track too.
let context: AnalyticsContext = { wallet: "none", mainnet: false };
// The wallet last reported by `wallet_connected`, so each connection counts
// once however many times the connector state changes while it lasts.
let reportedWallet = "none";

/**
 * Updates the wallet and cluster that events report, and sends
 * `wallet_connected` when a wallet appears (including the auto-connect on
 * page load). Watching state rather than the connector's `wallet:connected`
 * event: the auto-connect can finish before any listener is attached.
 */
export function setAnalyticsContext(next: AnalyticsContext) {
  context = next;
  if (next.wallet === "none") {
    reportedWallet = "none";
  } else if (next.mainnet && next.wallet !== reportedWallet) {
    reportedWallet = next.wallet;
    track("wallet_connected", { wallet: next.wallet });
  }
}

/** "wallet-standard:phantom" → "phantom"; "walletconnect" and "mwa:…" as is. */
export function walletLabel(connectorId: string | null | undefined): string {
  if (!connectorId) return "none";
  return connectorId.replace(/^wallet-standard:/, "").slice(0, 64);
}

/** Path segments that hold an ID, replaced before anything leaves the browser. */
const REDACTED_PATHS: [RegExp, string][] = [
  [
    /^\/spl-token-tools\/distributor\/(?!new(?:\/|$))[^/]+/,
    "/spl-token-tools/distributor/[airdropId]",
  ],
];

export function redactPath(pathname: string): string {
  for (const [pattern, replacement] of REDACTED_PATHS) {
    if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  }
  return pathname;
}

/** `beforeSend` for `<Analytics />`: redacts IDs from page view and event URLs. */
export function redactEvent(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    url.pathname = redactPath(url.pathname);
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

// The rendered page's route, set by `AppAnalytics`. Not the browser's
// pathname: a rewrite can serve a tool under another path
// (reclaim.blastctrl.com/ serves /reclaim-sol).
let tool: string | null = null;

/** The tool path for the root layout's active route segments. */
export function toolFromSegments(segments: string[]): string {
  const route = segments.filter((segment) => !segment.startsWith("("));
  return redactPath(`/${route.join("/")}`);
}

export function setAnalyticsTool(next: string) {
  tool = next;
}

function currentTool(): string {
  if (tool !== null) return tool;
  if (typeof window === "undefined") return "unknown";
  return redactPath(window.location.pathname);
}

function send(name: string) {
  if (!context.mainnet) return;
  track(name, { tool: currentTool(), wallet: context.wallet });
}

/** The user pressed a tool's main action button. Once per press. */
export function trackToolAttempt() {
  send("tool_attempt");
}

/** The RPC accepted a transaction. Once per transaction. */
export function trackTxSent() {
  send("tx_sent");
}
