import { useAppRpc } from "@/connector/app-rpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assetDataQueryKey } from "./use-asset-data";

export const ownerNftsKey = (address: string, network: string) =>
  ["owner-nfts", address, network] as const;

export function useOwnerNfts(address: string) {
  const queryClient = useQueryClient();
  const { rpc, dasAvailable, network } = useAppRpc();

  return useQuery({
    enabled: !!address && !!rpc && dasAvailable,
    queryKey: ownerNftsKey(address, network),
    queryFn: async () => {
      if (!rpc || !dasAvailable) {
        throw Error(`DAS API is not available on ${network}`);
      }

      const result = await rpc
        .searchAssets({ authorityAddress: address, ownerAddress: address })
        .send();

      const filtered = result.items.filter((asset) => asset.burnt === false);
      for (const asset of filtered) {
        queryClient.setQueryData(assetDataQueryKey(asset.id, network), asset);
      }
      return filtered;
    },
    staleTime: Infinity,
  });
}
