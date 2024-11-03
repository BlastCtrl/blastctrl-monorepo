import { useNetworkConfigurationStore } from "@/state/use-network-configuration";

export default function useQueryContext() {
  const { network } = useNetworkConfigurationStore();

  const endpoint = network || "mainnet-beta";
  const hasClusterOption = endpoint === "testnet" || endpoint === "devnet";
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
