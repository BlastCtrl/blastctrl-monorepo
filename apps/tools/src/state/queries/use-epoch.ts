import { useConnection } from "@solana/wallet-adapter-react";
import { EpochInfo } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

export function useCurrentEpoch() {
  const { connection } = useConnection();

  return useQuery<EpochInfo, Error>({
    queryKey: ["current-epoch"],
    retry: 1,
    staleTime: 120000,
    queryFn: async () => {
      try {
        const epochInfo = await connection.getEpochInfo();
        return epochInfo;
      } catch (error) {
        throw new Error(`Failed to fetch current epoch: ${error}`);
      }
    },
  });
}
