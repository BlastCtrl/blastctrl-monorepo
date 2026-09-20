import { useNetworkConfigurationStore } from "@/state/use-network-configuration";

const HELIUS_MAINNET_HOST = "mainnet.helius-rpc.com";
const HELIUS_DEVNET_HOST = "devnet.helius-rpc.com";

/**
 * Returns the DAS API url for a network, or null if DAS is not available there
 * (e.g. testnet). Custom RPC urls are assumed to point to mainnet.
 */
export function getDasUrl(network: string): string | null {
  const mainnetUrl = process.env.NEXT_PUBLIC_DAS_API!;

  switch (network.toLowerCase()) {
    case "devnet": {
      if (process.env.NEXT_PUBLIC_DAS_API_DEVNET) {
        return process.env.NEXT_PUBLIC_DAS_API_DEVNET;
      }
      // Helius serves devnet on a separate host with the same api key
      return mainnetUrl.includes(HELIUS_MAINNET_HOST)
        ? mainnetUrl.replace(HELIUS_MAINNET_HOST, HELIUS_DEVNET_HOST)
        : null;
    }
    case "testnet":
      return null;
    default:
      return mainnetUrl;
  }
}

export function useDasApi() {
  const network = useNetworkConfigurationStore((state) => state.network);
  return { network, url: getDasUrl(network) };
}
