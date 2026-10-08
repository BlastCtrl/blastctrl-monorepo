import type {
  MintLookup,
  ReclaimableAccount,
} from "@/app/spl-token-tools/reclaim-rent/_components/types";
import {
  discoverReclaimableAccounts,
  lookupReclaimableMint,
} from "@blastctrl/rent-reclaimer";
import { compress } from "@/lib/solana/common";
import { chunk } from "@/lib/utils";
import { useConnection } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDasApi } from "./das";
import type { DasAsset, HeliusResponse } from "./types";
import { assetDataQueryKey } from "./use-asset-data";

const reclaimableAccountsKey = (owner: string, network: string) =>
  ["reclaimable-accounts", owner, network] as const;

/**
 * Token accounts (both token programs) of a wallet, plus the mints of those
 * tokens that the wallet is the mint authority of. Each comes with what it
 * holds and the rent-exempt minimum for its size; excess is the difference.
 *
 * Mints are found among the wallet's own tokens because there is no cheap
 * way to search the chain by mint authority. Others can be added by address.
 */
export function useReclaimableAccounts(owner: string) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { network, url } = useDasApi();

  return useQuery<ReclaimableAccount[]>({
    queryKey: reclaimableAccountsKey(owner, network),
    enabled: false,
    queryFn: async () => {
      const accounts = await discoverReclaimableAccounts(connection, owner);
      const assets = await fetchAssets(
        url,
        accounts.map((a) => a.mint),
      );

      for (const asset of assets.values()) {
        queryClient.setQueryData<DasAsset>(
          assetDataQueryKey(asset.id, network),
          asset,
        );
      }

      return accounts.map((a) => withAssetInfo(a, assets.get(a.mint)));
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/** Checks a single mint address for the paste box on the Mints tab. */
export async function lookupMint(
  connection: Connection,
  dasUrl: string | null,
  address: string,
  owner: string,
): Promise<MintLookup> {
  const result = await lookupReclaimableMint(connection, address, owner);
  if (result.status === "not-a-mint" || result.status === "not-found")
    return result;

  const assets = await fetchAssets(dasUrl, [address]);
  const asset = assets.get(address);
  if (result.status !== "ok") {
    return { ...result, name: displayName(address, asset) };
  }

  return { status: "ok", account: withAssetInfo(result.account, asset) };
}

type Unnamed = Omit<ReclaimableAccount, "name" | "symbol" | "image">;

function withAssetInfo(
  account: Unnamed,
  asset: DasAsset | undefined,
): ReclaimableAccount {
  return {
    ...account,
    name: displayName(account.mint, asset),
    symbol:
      asset?.token_info?.symbol ||
      asset?.content?.metadata?.symbol ||
      account.mint.slice(0, 3),
    image: asset?.content?.links?.image,
  };
}

function displayName(mint: string, asset: DasAsset | undefined): string {
  return asset?.content?.metadata?.name || compress(mint, 4);
}

/** Names and images for display. Failing here must not fail the scan. */
async function fetchAssets(url: string | null, mints: string[]) {
  const assets = new Map<string, DasAsset>();
  if (!url || mints.length === 0) return assets;

  try {
    // getAssetBatch takes at most 1000 ids per call.
    const batches = await Promise.all(
      chunk([...new Set(mints)], 1000).map(async (ids) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "reclaimable-accounts",
            method: "getAssetBatch",
            params: { ids },
          }),
        });
        if (!response.ok) {
          throw Error(`getAssetBatch failed: ${response.status}`);
        }
        const data = (await response.json()) as HeliusResponse<
          (DasAsset | null)[]
        >;
        return data.result;
      }),
    );
    for (const asset of batches.flat()) {
      if (asset) assets.set(asset.id, asset);
    }
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
  }
  return assets;
}
