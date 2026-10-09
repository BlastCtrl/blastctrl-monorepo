import useUmi from "@/lib/hooks/use-umi";
import { chunk } from "@/lib/utils";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import type { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  deserializeMetadata,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import type { Umi } from "@metaplex-foundation/umi";
import { publicKey } from "@metaplex-foundation/umi";
import { useQuery } from "@tanstack/react-query";

/** `getMultipleAccounts` takes at most 100 addresses. */
const ACCOUNTS_PER_REQUEST = 100;
const PARALLEL_REQUESTS = 4;

/**
 * The Token Metadata account of every mint, or null where there isn't one.
 * Always read fresh: the plan built on it decides what gets sent.
 */
export function useNftMetadata(mints: string[]) {
  const umi = useUmi();
  const network = useNetworkConfigurationStore((state) => state.network);

  return useQuery({
    queryKey: ["nft-metadata", network, mints],
    queryFn: () => fetchMetadata(umi, mints),
    enabled: mints.length > 0,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

async function fetchMetadata(umi: Umi, mints: string[]) {
  const addresses = mints.map(
    (mint) => findMetadataPda(umi, { mint: publicKey(mint) })[0],
  );
  const result = new Map<string, Metadata | null>();
  const requests = chunk(
    addresses.map((address, i) => ({ address, mint: mints[i]! })),
    ACCOUNTS_PER_REQUEST,
  );
  for (const group of chunk(requests, PARALLEL_REQUESTS)) {
    await Promise.all(
      group.map(async (request) => {
        const accounts = await umi.rpc.getAccounts(
          request.map((r) => r.address),
          { commitment: "confirmed" },
        );
        accounts.forEach((account, i) => {
          const { mint } = request[i]!;
          if (
            !account.exists ||
            account.owner !== MPL_TOKEN_METADATA_PROGRAM_ID
          ) {
            result.set(mint, null);
            return;
          }
          try {
            result.set(mint, deserializeMetadata(account));
          } catch {
            result.set(mint, null);
          }
        });
      }),
    );
  }
  return result;
}
