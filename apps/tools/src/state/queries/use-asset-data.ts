import { useQuery } from "@tanstack/react-query";
import { useDasApi } from "./das";
import type { DasAsset, HeliusResponse } from "./types";

export const assetDataQueryKey = (address: string, network: string) =>
  ["asset", address, network] as const;

export function useAssetData(address: string) {
  const { network, url } = useDasApi();

  return useQuery<DasAsset>({
    enabled: !!address && !!url,
    queryKey: assetDataQueryKey(address, network),
    queryFn: async () => {
      if (!url) throw Error(`DAS API is not available on ${network}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "text",
          method: "getAsset",
          params: {
            id: address,
            options: {
              showFungible: true,
            },
          },
        }),
      });

      if (!response.ok)
        throw Error(
          `Request failed with status ${response.status}: ${await response.text()}`,
        );

      const data = (await response.json()) as HeliusResponse<DasAsset>;

      return data.result;
    },
    staleTime: Infinity,
  });
}
