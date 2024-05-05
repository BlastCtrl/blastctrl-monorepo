import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

export default function useQueryContext() {
  const { network } = useNetworkConfigurationStore();

  const endpoint = network || "mainnet-beta";
  const hasClusterOption = endpoint !== WalletAdapterNetwork.Mainnet;
  const fmtUrlWithCluster = (url: string) => {
    if (hasClusterOption) {
      const mark = url.includes("?") ? "&" : "?";
      return decodeURIComponent(`${url}${mark}cluster=${endpoint}`);
    }
    return url;
  };

  return {
    fmtUrlWithCluster,
  };
}
