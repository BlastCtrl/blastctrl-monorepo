import { useSolanaClient } from "@solana/connector/react";
import type { GetEpochInfoApi, Rpc } from "@solana/kit";
import { queryOptions, useQuery } from "@tanstack/react-query";

export type EpochInfo = {
  epoch: number;
  absoluteSlot: number;
  slotIndex: number;
  slotsInEpoch: number;
};

export const currentEpochQuery = (rpc: Rpc<GetEpochInfoApi> | null) =>
  queryOptions({
    queryKey: ["current-epoch"],
    enabled: rpc !== null,
    retry: 1,
    staleTime: 120000,
    queryFn: async (): Promise<EpochInfo> => {
      if (!rpc) throw new Error("RPC not available");
      try {
        const info = await rpc.getEpochInfo().send();
        return {
          epoch: Number(info.epoch),
          absoluteSlot: Number(info.absoluteSlot),
          slotIndex: Number(info.slotIndex),
          slotsInEpoch: Number(info.slotsInEpoch),
        };
      } catch (error) {
        throw new Error(
          `Failed to fetch current epoch: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
  });

/** Current epoch for the connector's active cluster; no wallet needed. */
export function useCurrentEpoch() {
  const { client } = useSolanaClient();
  return useQuery(currentEpochQuery(client?.rpc ?? null));
}
