import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { describe, expect, it } from "vitest";
import { chainForEndpoint, walletNetworkForEndpoint } from "./endpoints";

describe("chainForEndpoint", () => {
  it("knows devnet and testnet RPCs by their url", () => {
    expect(chainForEndpoint("https://api.devnet.solana.com")).toBe(
      "solana:devnet",
    );
    expect(chainForEndpoint("https://devnet.helius-rpc.com/?api-key=x")).toBe(
      "solana:devnet",
    );
    expect(chainForEndpoint("https://api.testnet.solana.com")).toBe(
      "solana:testnet",
    );
  });

  it("takes anything else for mainnet", () => {
    expect(chainForEndpoint("https://example.mainnet.rpcpool.com/key")).toBe(
      "solana:mainnet",
    );
    expect(chainForEndpoint("https://api.mainnet-beta.solana.com")).toBe(
      "solana:mainnet",
    );
  });
});

describe("walletNetworkForEndpoint", () => {
  it("gives wallet adapters the cluster the RPC is on", () => {
    expect(
      walletNetworkForEndpoint("https://devnet.helius-rpc.com/?api-key=x"),
    ).toBe(WalletAdapterNetwork.Devnet);
    expect(walletNetworkForEndpoint("https://api.testnet.solana.com")).toBe(
      WalletAdapterNetwork.Testnet,
    );
    expect(
      walletNetworkForEndpoint("https://example.mainnet.rpcpool.com/key"),
    ).toBe(WalletAdapterNetwork.Mainnet);
  });
});
