import { useAppRpc } from "@/connector/app-rpc";
import {
  fetchTokenMetadatas,
  type TokenMetadata,
} from "@/lib/solana/metaplex-token-metadata";
import type { Address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

/**
 * The Token Metadata account of every mint, by mint, or null where there
 * isn't one. Always read fresh: what a tool plans on it decides what gets
 * sent, so a stale copy is worse than a wait.
 */
export function useTokenMetadata(mints: Address[]) {
  const { rpc, network } = useAppRpc();

  return useQuery({
    queryKey: ["token-metadata", network, mints],
    enabled: !!rpc && mints.length > 0,
    queryFn: async () => {
      if (!rpc) throw Error("RPC not available");
      const list = await fetchTokenMetadatas(rpc, mints);
      return new Map<Address, TokenMetadata | null>(
        mints.map((mint, i) => [mint, list[i] ?? null]),
      );
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
