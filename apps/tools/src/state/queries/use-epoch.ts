import type { Connection } from "@solana/web3.js";
import { queryOptions } from "@tanstack/react-query";

export const currentEpochQuery = (connection: Connection) =>
  queryOptions({
    queryKey: ["current-epoch"],
    retry: 1,
    staleTime: 120000,
    queryFn: async () => {
      try {
        const epochInfo = await connection.getEpochInfo();
        return epochInfo;
      } catch (error) {
        throw new Error(
          `Failed to fetch current epoch: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
