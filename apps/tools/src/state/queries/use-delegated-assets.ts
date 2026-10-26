import { useAppRpc } from "@/connector/app-rpc";
import {
  fetchDelegatedTokenAccounts,
  type ParsedDelegatedTokenAccount,
} from "@blastctrl/token-scans";
import { address } from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchAssetData } from "./use-asset-data";

export type { ParsedDelegatedTokenAccount };

export const delegatedAssetsKey = (address: string) =>
  ["delegated-assets", address] as const;

/**
 * Token (and Token-2022) accounts owned by `owner` that have a delegate set.
 * Disabled by default; call `refetch()`.
 */
export function useDelegatedAssets(owner: string) {
  const { rpc, dasAvailable, network } = useAppRpc();
  const queryClient = useQueryClient();

  return useQuery<ParsedDelegatedTokenAccount[]>({
    queryKey: delegatedAssetsKey(owner),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");
      if (!rpc) throw Error("RPC not available");
      const parsedResults = await fetchDelegatedTokenAccounts(
        rpc,
        address(owner),
      );

      // Metadata for the rows the list renders. It is cosmetic, so a DAS
      // failure must not fail the scan.
      await prefetchAssetData(
        { rpc, dasAvailable, network },
        queryClient,
        parsedResults.map((v) => v.mint),
      );
      return parsedResults;
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
}
