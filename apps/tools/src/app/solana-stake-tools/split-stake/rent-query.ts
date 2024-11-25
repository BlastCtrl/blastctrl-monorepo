import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";

export function useRentQuery(space: number) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["minimumRent", space],
    queryFn: async () => {
      return connection.getMinimumBalanceForRentExemption(space);
    },
    retry: 2,
    retryDelay: 200,
    staleTime: Infinity,
  });
}
