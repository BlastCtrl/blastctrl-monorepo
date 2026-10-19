import { useCluster } from "@solana/connector/react";

/** Appends `?cluster=` to explorer links when the connector is off mainnet. */
export default function useQueryContext() {
  const { type } = useCluster();

  const cluster = type === "devnet" || type === "testnet" ? type : null;
  const fmtUrlWithCluster = (url: string) => {
    if (!cluster) return url;
    const mark = url.includes("?") ? "&" : "?";
    return decodeURIComponent(`${url}${mark}cluster=${cluster}`);
  };

  return { fmtUrlWithCluster };
}
