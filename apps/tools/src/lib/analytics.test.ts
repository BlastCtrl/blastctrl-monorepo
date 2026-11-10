import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track }));

import { withTxSentTracking } from "@/connector/app-rpc";
import {
  redactEvent,
  redactPath,
  setAnalyticsContext,
  setAnalyticsTool,
  toolFromSegments,
  trackToolAttempt,
  walletLabel,
} from "./analytics";

beforeEach(() => {
  setAnalyticsContext({ wallet: "none", mainnet: true });
  setAnalyticsContext({ wallet: "phantom", mainnet: true });
  track.mockClear();
});

describe("wallet_connected", () => {
  it("reports each connection once", () => {
    setAnalyticsContext({ wallet: "none", mainnet: true });
    setAnalyticsContext({ wallet: "solflare", mainnet: true });
    setAnalyticsContext({ wallet: "solflare", mainnet: true });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("wallet_connected", {
      wallet: "solflare",
    });
  });

  it("reports nothing off mainnet", () => {
    setAnalyticsContext({ wallet: "none", mainnet: false });
    setAnalyticsContext({ wallet: "solflare", mainnet: false });
    expect(track).not.toHaveBeenCalled();
  });
});

describe("redactPath", () => {
  it("replaces an airdrop ID", () => {
    expect(redactPath("/spl-token-tools/distributor/abc123")).toBe(
      "/spl-token-tools/distributor/[airdropId]",
    );
  });

  it("leaves the static distributor routes alone", () => {
    expect(redactPath("/spl-token-tools/distributor")).toBe(
      "/spl-token-tools/distributor",
    );
    expect(redactPath("/spl-token-tools/distributor/new")).toBe(
      "/spl-token-tools/distributor/new",
    );
  });

  it("redacts event URLs and keeps the query", () => {
    const event = redactEvent({
      type: "pageview",
      url: "https://tools.blastctrl.com/spl-token-tools/distributor/abc?x=1",
    });
    expect(event.url).toBe(
      "https://tools.blastctrl.com/spl-token-tools/distributor/[airdropId]?x=1",
    );
  });
});

describe("toolFromSegments", () => {
  it("names the rendered route, not the browser path", () => {
    // reclaim.blastctrl.com/ is a rewrite to /reclaim-sol.
    expect(toolFromSegments(["reclaim-sol"])).toBe("/reclaim-sol");
    expect(toolFromSegments(["spl-token-tools", "close-empty"])).toBe(
      "/spl-token-tools/close-empty",
    );
    expect(toolFromSegments([])).toBe("/");
  });

  it("drops route groups and redacts IDs", () => {
    expect(toolFromSegments(["(tools)", "gasless-swap"])).toBe("/gasless-swap");
    expect(toolFromSegments(["spl-token-tools", "distributor", "abc"])).toBe(
      "/spl-token-tools/distributor/[airdropId]",
    );
  });

  it("is what events report", () => {
    setAnalyticsTool("/reclaim-sol");
    trackToolAttempt();
    expect(track).toHaveBeenCalledWith("tool_attempt", {
      tool: "/reclaim-sol",
      wallet: "phantom",
    });
  });
});

describe("walletLabel", () => {
  it("strips the wallet-standard prefix", () => {
    expect(walletLabel("wallet-standard:solflare")).toBe("solflare");
    expect(walletLabel("walletconnect")).toBe("walletconnect");
    expect(walletLabel(null)).toBe("none");
  });
});

describe("events", () => {
  it("sends tool and wallet on mainnet", () => {
    trackToolAttempt();
    expect(track).toHaveBeenCalledWith("tool_attempt", {
      tool: expect.any(String),
      wallet: "phantom",
    });
  });

  it("sends nothing off mainnet", () => {
    setAnalyticsContext({ wallet: "phantom", mainnet: false });
    trackToolAttempt();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("withTxSentTracking", () => {
  const payload = (method: string) => ({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: [],
  });

  it("tracks an accepted sendTransaction", async () => {
    const transport = withTxSentTracking(
      async () => ({ result: "sig" }) as never,
    );
    await transport({ payload: payload("sendTransaction") });
    expect(track).toHaveBeenCalledWith("tx_sent", expect.anything());
  });

  it("ignores rejected sends and other methods", async () => {
    const rejected = withTxSentTracking(
      async () => ({ error: { code: -32002, message: "x" } }) as never,
    );
    await rejected({ payload: payload("sendTransaction") });
    const other = withTxSentTracking(async () => ({ result: 1 }) as never);
    await other({ payload: payload("getSlot") });
    expect(track).not.toHaveBeenCalled();
  });
});
