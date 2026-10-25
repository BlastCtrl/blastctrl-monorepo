import type {
  MintLookup,
  ReclaimableAccount,
} from "@/app/spl-token-tools/reclaim-rent/_components/types";
import { useAppRpc, type AppRpc } from "@/connector/app-rpc";
import { compress } from "@/lib/solana/common";
import {
  discoverReclaimableAccounts,
  lookupReclaimableMint,
  type DiscoveredAccount,
} from "@blastctrl/rent-reclaimer";
import { address } from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DasAsset } from "./types";
import { assetDataQueryKey, fetchAssets } from "./use-asset-data";

const reclaimableAccountsKey = (owner: string, network: string) =>
  ["reclaimable-accounts", owner, network] as const;

/**
 * Token accounts (both token programs) of a wallet, plus the mints of those
 * tokens that the wallet is the mint authority of. Each comes with what it
 * holds and the rent-exempt minimum for its size; excess is the difference.
 *
 * Mints are found among the wallet's own tokens because there is no cheap
 * way to search the chain by mint authority. Others can be added by address.
 * Reads through the cluster's RPC, so any address can be scanned without a
 * wallet; the scan runs on `refetch()` only.
 */
export function useReclaimableAccounts(owner: string) {
  const queryClient = useQueryClient();
  const { rpc, dasAvailable, network } = useAppRpc();

  return useQuery<ReclaimableAccount[]>({
    queryKey: reclaimableAccountsKey(owner, network),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");
      if (!rpc) throw Error("RPC not available");

      const { accounts, assets } = await fetchReclaimableAccounts(
        rpc,
        dasAvailable,
        owner,
      );

      for (const asset of assets.values()) {
        queryClient.setQueryData<DasAsset>(
          assetDataQueryKey(asset.id, network),
          asset,
        );
      }

      return accounts;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/**
 * The scan behind {@link useReclaimableAccounts}, outside React: the
 * wallet's token accounts and controlled mints, named from DAS when the
 * cluster has it. Returns the DAS assets too, for the hook to cache.
 */
async function fetchReclaimableAccounts(
  rpc: AppRpc,
  dasAvailable: boolean,
  owner: string,
): Promise<{ accounts: ReclaimableAccount[]; assets: Map<string, DasAsset> }> {
  const accounts = await discoverReclaimableAccounts(rpc, address(owner));
  const assets = await fetchAssets(
    dasAvailable ? rpc : null,
    accounts.map((a) => a.mint),
  );

  return {
    accounts: accounts.map((a) => withAssetInfo(a, assets.get(a.mint))),
    assets,
  };
}

/** Checks a single mint address for the paste box on the Mints tab. */
export async function lookupMint(
  rpc: AppRpc,
  dasAvailable: boolean,
  mint: string,
  owner: string,
): Promise<MintLookup> {
  const result = await lookupReclaimableMint(
    rpc,
    address(mint),
    address(owner),
  );
  if (result.status === "not-found" || result.status === "not-a-mint") {
    return result;
  }

  const assets = await fetchAssets(dasAvailable ? rpc : null, [mint]);
  const asset = assets.get(mint);
  if (result.status !== "ok") {
    return { ...result, name: displayName(mint, asset) };
  }
  return { status: "ok", account: withAssetInfo(result.account, asset) };
}

function withAssetInfo(
  account: DiscoveredAccount,
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
