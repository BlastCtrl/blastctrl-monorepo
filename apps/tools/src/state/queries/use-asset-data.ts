import { useAppRpc, type AppRpc } from "@/connector/app-rpc";
import { chunk } from "@/lib/utils";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { DasAsset } from "./types";

/** `getAssets` rejects requests with more ids than this. */
const GET_ASSETS_MAX_IDS = 1000;

export const assetDataQueryKey = (address: string, network: string) =>
  ["asset", address, network] as const;

export function useAssetData(address: string) {
  const { rpc, dasAvailable, network } = useAppRpc();

  return useQuery<DasAsset>({
    enabled: !!address && !!rpc && dasAvailable,
    queryKey: assetDataQueryKey(address, network),
    queryFn: async () => {
      if (!rpc || !dasAvailable) {
        throw Error(`DAS API is not available on ${network}`);
      }
      return rpc
        .getAsset({ id: address, options: { showFungible: true } })
        .send();
    },
    staleTime: Infinity,
  });
}

/**
 * Fetches DAS metadata (names, images, decimals) for `mints`, deduped and in
 * chunks of at most 1000 ids. Metadata is cosmetic, so this never throws: a
 * chunk that fails is logged and skipped while the others still arrive.
 */
export async function fetchAssets(
  rpc: AppRpc | null,
  mints: string[],
): Promise<Map<string, DasAsset>> {
  const assets = new Map<string, DasAsset>();
  const ids = [...new Set(mints)];
  if (!rpc || ids.length === 0) return assets;

  const batches = await Promise.allSettled(
    chunk(ids, GET_ASSETS_MAX_IDS).map((batch) =>
      rpc.getAssets({ ids: batch }).send(),
    ),
  );
  for (const batch of batches) {
    if (batch.status === "rejected") {
      const reason = batch.reason as unknown;
      console.warn(
        "getAssets failed:",
        reason instanceof Error ? reason.message : String(reason),
      );
      continue;
    }
    for (const asset of batch.value) {
      if (asset) assets.set(asset.id, asset);
    }
  }
  return assets;
}

/**
 * Seeds the `useAssetData` cache for the `mints` that are not cached yet, so
 * list rows that render `useAssetData(mint)` don't each fire a `getAsset`.
 * Takes the result of `useAppRpc()`; a no-op where DAS is unavailable.
 */
export async function prefetchAssetData(
  { rpc, dasAvailable, network }: ReturnType<typeof useAppRpc>,
  queryClient: QueryClient,
  mints: string[],
): Promise<void> {
  if (!dasAvailable) return;
  const missing = mints.filter(
    (mint) => !queryClient.getQueryData(assetDataQueryKey(mint, network)),
  );
  const assets = await fetchAssets(rpc, missing);
  for (const asset of assets.values()) {
    queryClient.setQueryData<DasAsset>(
      assetDataQueryKey(asset.id, network),
      asset,
    );
  }
}
