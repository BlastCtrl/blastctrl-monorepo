import type { ReclaimableAccount } from "@/app/spl-token-tools/reclaim-rent/_components/types";
import { compress } from "@/lib/solana/common";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDasApi } from "./das";
import type { DasAsset, HeliusResponse } from "./types";
import { assetDataQueryKey } from "./use-asset-data";

export const reclaimableAccountsKey = (owner: string, network: string) =>
  ["reclaimable-accounts", owner, network] as const;

type ParsedTokenAccountInfo = {
  mint: string;
  owner: string;
  isNative: boolean;
  state: string;
  tokenAmount: { amount: string; uiAmountString: string };
};

/**
 * Token accounts (both token programs) of a wallet, with what each holds and
 * the rent-exempt minimum for its size. Excess is the difference.
 */
export function useReclaimableAccounts(owner: string) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { network, url } = useDasApi();

  return useQuery<ReclaimableAccount[]>({
    queryKey: reclaimableAccountsKey(owner, network),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");

      const accounts = await fetchTokenAccounts(connection, owner);
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

      return accounts.map((account) => {
        const asset = assets.get(account.mint);
        return {
          ...account,
          name: asset?.content?.metadata?.name || compress(account.mint, 4),
          symbol:
            asset?.token_info?.symbol ||
            asset?.content?.metadata?.symbol ||
            account.mint.slice(0, 3),
          image: asset?.content?.links?.image,
        };
      });
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

async function fetchTokenAccounts(connection: Connection, owner: string) {
  const ownerKey = new PublicKey(owner);
  const programs = [
    { id: TOKEN_PROGRAM_ID, program: "token" as const },
    { id: TOKEN_2022_PROGRAM_ID, program: "token-2022" as const },
  ];

  const results = await Promise.all(
    programs.map(async ({ id, program }) => {
      const { value } = await connection.getParsedTokenAccountsByOwner(
        ownerKey,
        { programId: id },
      );
      return value.map(({ pubkey, account }) => {
        const info = account.data.parsed.info as ParsedTokenAccountInfo;
        return {
          id: pubkey.toBase58(),
          kind: "token-account" as const,
          address: pubkey.toBase58(),
          mint: info.mint,
          program,
          tokenBalance: info.tokenAmount.uiAmountString,
          isEmpty: info.tokenAmount.amount === "0",
          dataLength: account.data.space,
          lamports: account.lamports,
          blockedReason: info.isNative
            ? "Wrapped SOL accounts aren't supported"
            : undefined,
        };
      });
    }),
  );
  const accounts = results.flat();

  // One rent lookup per distinct account size covers the whole wallet.
  const sizes = [...new Set(accounts.map((a) => a.dataLength))];
  const minimums = new Map(
    await Promise.all(
      sizes.map(
        async (size) =>
          [
            size,
            await connection.getMinimumBalanceForRentExemption(size),
          ] as const,
      ),
    ),
  );

  return accounts.map((a) => ({ ...a, minimum: minimums.get(a.dataLength)! }));
}

/** Names and images for display. Failing here must not fail the scan. */
async function fetchAssets(url: string | null, mints: string[]) {
  const assets = new Map<string, DasAsset>();
  if (!url || mints.length === 0) return assets;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "reclaimable-accounts",
        method: "getAssetBatch",
        params: { ids: [...new Set(mints)] },
      }),
    });
    if (!response.ok) throw Error(`getAssetBatch failed: ${response.status}`);
    const data = (await response.json()) as HeliusResponse<(DasAsset | null)[]>;
    for (const asset of data.result) {
      if (asset) assets.set(asset.id, asset);
    }
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
  }
  return assets;
}
