import { useSolanaClient } from "@solana/connector/react";
import { useQuery } from "@tanstack/react-query";

/** Rent-exempt minimum for an account of `space` bytes, from the connector's active cluster. */
export function useRentQuery(space: number) {
  const { client } = useSolanaClient();

  return useQuery({
    queryKey: ["minimumRent", space],
    enabled: client !== null,
    queryFn: async () => {
      if (!client) throw Error("RPC not available");
      return client.rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();
    },
    retry: 2,
    retryDelay: 200,
    staleTime: Infinity,
  });
}
