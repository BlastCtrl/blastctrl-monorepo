import {
  ACCOUNT_STORAGE_OVERHEAD,
  FALLBACK_LAMPORTS_PER_BYTE,
} from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import { useAppRpc } from "@/connector/app-rpc";
import { useQuery } from "@tanstack/react-query";

/**
 * Rent-exempt minimum, in lamports, for an account of `space` bytes on the
 * active cluster. Needs no wallet. Keyed by cluster, since the clusters move
 * through the SIMD-0437 rent reductions at different times, and stale after
 * a few minutes so a reduction shows up without a reload.
 */
export function useRentQuery(space: number) {
  const { rpc, network } = useAppRpc();

  return useQuery({
    queryKey: ["rent", network, space],
    enabled: !!rpc,
    queryFn: async ({ signal }) => {
      if (!rpc) throw Error("RPC not available");
      return rpc
        .getMinimumBalanceForRentExemption(BigInt(space))
        .send({ abortSignal: signal });
    },
    retry: 2,
    retryDelay: 200,
    staleTime: 5 * 60_000,
  });
}

/**
 * The live `lamports_per_byte` of the active cluster. The minimum for a
 * zero-byte account is exactly the storage overhead times the rate, so it is
 * the same query as {@link useRentQuery} for zero bytes. A fallback until it
 * has loaded; anything that matters uses minimums from the RPC, never this.
 */
export function useRentRate() {
  const { data } = useRentQuery(0);
  return {
    lamportsPerByte:
      data === undefined
        ? FALLBACK_LAMPORTS_PER_BYTE
        : Number(data) / ACCOUNT_STORAGE_OVERHEAD,
  };
}
