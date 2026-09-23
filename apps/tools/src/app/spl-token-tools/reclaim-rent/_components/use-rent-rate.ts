import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { ACCOUNT_STORAGE_OVERHEAD, FALLBACK_LAMPORTS_PER_BYTE } from "./rent";

/**
 * The live `lamports_per_byte`. The minimum for a zero-byte account is exactly
 * the 128-byte storage overhead times the rate, so one RPC call gives it.
 */
export function useRentRate() {
  const { connection } = useConnection();

  const query = useQuery({
    queryKey: ["rent-rate", connection.rpcEndpoint],
    queryFn: async () =>
      (await connection.getMinimumBalanceForRentExemption(0)) /
      ACCOUNT_STORAGE_OVERHEAD,
    staleTime: 5 * 60_000,
    retry: 2,
  });

  return {
    lamportsPerByte: query.data ?? FALLBACK_LAMPORTS_PER_BYTE,
    isLive: query.data !== undefined,
  };
}
