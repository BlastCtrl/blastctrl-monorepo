import type { MetadataRoute } from "next";

const baseUrl = "https://tools.blastctrl.com";

const paths = [
  "/",
  "/gasless-bonk-swap",
  "/gasless-swap",
  "/gmeet-cc-capture",
  "/permanent-storage-tools",
  "/permanent-storage-tools/file-upload",
  "/reclaim-sol",
  "/solana-nft-tools",
  "/solana-nft-tools/collections",
  "/solana-nft-tools/mint-core",
  "/solana-nft-tools/mint",
  "/solana-nft-tools/nft-faucet",
  "/solana-nft-tools/transfer-authority",
  "/solana-nft-tools/update",
  "/solana-stake-tools",
  "/solana-stake-tools/merge-stake",
  "/solana-stake-tools/mev-rewards",
  "/solana-stake-tools/set-lockup",
  "/solana-stake-tools/split-stake",
  "/solana-stake-tools/stake-authorize",
  "/solana-stake-tools/stake-create",
  "/spl-token-tools",
  "/spl-token-tools/close-empty",
  "/spl-token-tools/create-token",
  "/spl-token-tools/distributor",
  "/spl-token-tools/reclaim-rent",
  "/spl-token-tools/recover-nested",
  "/spl-token-tools/revoke-delegations",
  "/spl-token-tools/token-hoover",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({ url: new URL(path, baseUrl).toString() }));
}
