import {
  rentStatusKey,
  type RentStatus,
} from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import { useAppRpc } from "@/connector/app-rpc";
import { readRentReductionStatus } from "@blastctrl/rent-reclaimer";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

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

const subscribeToNothing = () => () => {};

/**
 * Where the active cluster is in the SIMD-0437 rent reduction, or null until
 * that is known.
 *
 * On mainnet the pages that show it put the server's read in the query cache
 * (see RentStatusBoundary), so it is there on the first paint. The browser
 * reads it again once that is a few minutes old, and on its own for the
 * other clusters. Null means nothing has loaded yet or the read failed:
 * show the reduction without saying which step is live.
 *
 * Only for what the page says about the reduction. What an account can give
 * back always comes from minimums the scan reads itself.
 */
export function useRentStatus(): RentStatus | null {
  const { rpc, network } = useAppRpc();
  // While hydrating, the connector reports the server's cluster but can
  // already hand out the RPC of the cluster it restored, so a read then
  // could file another cluster's status under this one's key.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const { data } = useQuery({
    queryKey: rentStatusKey(network),
    enabled: !!rpc && hydrated,
    queryFn: async ({ signal }) => {
      if (!rpc) throw Error("RPC not available");
      return readRentReductionStatus(rpc, { abortSignal: signal });
    },
    retry: 2,
    retryDelay: 200,
    staleTime: 5 * 60_000,
    // The page works without it, so a failed read isn't worth a toast.
    meta: { silent: true },
  });
  return data ?? null;
}
