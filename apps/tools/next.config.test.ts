import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config.js";

// Routing tests do not need the credentials validated at build time.
vi.mock("jiti", () => ({ default: () => () => {} }));

beforeAll(() => {
  vi.stubEnv("BLAST_BACKEND_URL", "https://backend.example.com");
});
afterAll(() => vi.unstubAllEnvs());

function resolve(url: string) {
  return unstable_getResponseFromNextConfig({ url, nextConfig });
}

describe("reclaim domain routing", () => {
  it.each([
    ["/?utm_source=campaign", "/reclaim-sol?utm_source=campaign"],
    ["/sitemap.xml", "/reclaim-sol/sitemap.xml"],
  ])("rewrites %s on the reclaim domain", async (path, destination) => {
    const response = await resolve(`https://reclaim.blastctrl.com${path}`);
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBe(
      `https://reclaim.blastctrl.com${destination}`,
    );
  });

  it.each(["tools", "reclaim"])(
    "redirects the old path on %s without a loop or lost query parameters",
    async (subdomain) => {
      const response = await resolve(
        `https://${subdomain}.blastctrl.com/reclaim-sol?utm_source=campaign`,
      );
      expect(response.status).toBe(308);
      const destination = getRedirectUrl(response);
      expect(destination).toBe(
        "https://reclaim.blastctrl.com/?utm_source=campaign",
      );
      expect(getRedirectUrl(await resolve(destination!))).toBeNull();
    },
  );

  it("redirects the nested sitemap to its public URL", async () => {
    const response = await resolve(
      "https://reclaim.blastctrl.com/reclaim-sol/sitemap.xml",
    );
    expect(getRedirectUrl(response)).toBe(
      "https://reclaim.blastctrl.com/sitemap.xml",
    );
  });

  it.each([
    "/spl-token-tools/reclaim-rent?network=devnet",
    "/solana-nft-tools/mint",
    "/unknown-page",
    "/api-lookalike",
  ])("keeps other page %s on the toolbox domain", async (path) => {
    const response = await resolve(`https://reclaim.blastctrl.com${path}`);
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`https://tools.blastctrl.com${path}`);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fsol_coin.png&w=64&q=75",
    "/api/octane/price",
    "/blastctrl_icon.svg",
    "/favicon.ico",
    "/robots.txt",
  ])("leaves asset or API request %s untouched", async (path) => {
    const response = await resolve(`https://reclaim.blastctrl.com${path}`);
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBeNull();
  });

  it.each([
    "https://tools.blastctrl.com/",
    "https://tools.blastctrl.com/sitemap.xml",
    "https://tools.blastctrl.com/spl-token-tools/reclaim-rent",
    "http://localhost:3000/reclaim-sol",
    "https://preview.vercel.app/reclaim-sol",
    "https://preview.vercel.app/",
    "https://reclaim-blastctrl.com/",
  ])("preserves the existing route at %s", async (url) => {
    const response = await resolve(url);
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBeNull();
  });

  it.each(["tools", "reclaim"])(
    "preserves the backend proxy on %s",
    async (subdomain) => {
      const response = await resolve(
        `https://${subdomain}.blastctrl.com/blast-api/accounts?limit=10`,
      );
      expect(getRedirectUrl(response)).toBeNull();
      expect(getRewrittenUrl(response)).toBe(
        "https://backend.example.com/accounts?limit=10",
      );
    },
  );
});
