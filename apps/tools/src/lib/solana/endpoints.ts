import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import type { Cluster } from "@solana/web3.js";

export const Networks: { [key in Cluster]: string } = {
  "mainnet-beta":
    process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? clusterApiUrl("mainnet-beta"),
  testnet: clusterApiUrl("testnet"),
  devnet:
    process.env.NEXT_PUBLIC_RPC_ENDPOINT_DEVNET || clusterApiUrl("devnet"),
};

/** The same mapping the adapter's sendTransaction uses for the chain. */
export function chainForEndpoint(endpoint: string) {
  if (endpoint.includes("https://api.mainnet-beta.solana.com")) {
    return "solana:mainnet";
  }
  if (/\bdevnet\b/i.test(endpoint)) return "solana:devnet";
  if (/\btestnet\b/i.test(endpoint)) return "solana:testnet";
  if (/\blocalhost\b/i.test(endpoint) || /\b127\.0\.0\.1\b/.test(endpoint)) {
    return "solana:localnet";
  }
  return "solana:mainnet";
}

/**
 * The cluster to give wallet adapters that take one when they're set up.
 * Solflare's falls back to mainnet without it, and then warns about a
 * network mismatch on every devnet transaction.
 */
export function walletNetworkForEndpoint(endpoint: string) {
  switch (chainForEndpoint(endpoint)) {
    case "solana:devnet":
      return WalletAdapterNetwork.Devnet;
    case "solana:testnet":
      return WalletAdapterNetwork.Testnet;
    default:
      return WalletAdapterNetwork.Mainnet;
  }
}
