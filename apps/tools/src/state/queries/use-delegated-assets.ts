import {
  AccountLayout,
  AccountState,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import type { GetProgramAccountsFilter } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DasAsset, HeliusResponse } from "./types";
import { assetDataQueryKey } from "./use-asset-data";

const url = process.env.NEXT_PUBLIC_DAS_API!;

export type ParsedDelegatedTokenAccount = {
  token_account: string;
  mint: string;
  balance: bigint;
  isFrozen: boolean;
  token_program: string;
  delegate: string;
  delegated_amount: bigint;
  delegate_option: 0 | 1;
};

export const delegatedAssetsKey = (address: string) =>
  ["delegated-assets", address] as const;

export function useDelegatedAssets(address: string) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useQuery<ParsedDelegatedTokenAccount[]>({
    queryKey: delegatedAssetsKey(address),
    enabled: false,
    queryFn: async () => {
      if (!address) throw Error("No address provided");

      const filters = getFilters(address);
      const results = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        filters,
      });

      const results22 = await connection.getTokenAccountsByOwner(
        new PublicKey(address),
        {
          programId: TOKEN_2022_PROGRAM_ID,
        },
      );

      const parsedResults = [...results, ...results22.value]
        .map(({ pubkey, account }) => {
          const parsed = AccountLayout.decode(account.data);
          // Only return accounts that have been delegated
          // if (parsed.delegate !== null && parsed.delegatedAmount !== null) {
          if (parsed.delegatedAmount !== 0n) {
            return {
              token_account: pubkey.toBase58(),
              mint: parsed.mint.toBase58(),
              balance: parsed.amount,
              isFrozen: parsed.state === AccountState.Frozen,
              token_program: account.owner.toBase58(),
              delegate: parsed.delegate.toBase58(),
              delegated_amount: parsed.delegatedAmount,
              delegate_option: parsed.delegateOption,
            };
          }
          return null;
        })
        .filter(Boolean) as ParsedDelegatedTokenAccount[];

      const uncachedAssets = parsedResults.filter((v) => {
        return !queryClient.getQueryData(assetDataQueryKey(v.mint));
      });

      // Fetch assetsBatch, but if it fails, continue anyway
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "text",
            method: "getAssetBatch",
            params: { ids: uncachedAssets.map((a) => a.mint) },
          }),
        });
        if (!response.ok) throw Error("Failed to get asset info");
        const assets = (await response.json()) as HeliusResponse<DasAsset[]>;

        for (const asset of assets.result) {
          queryClient.setQueryData<DasAsset>(
            assetDataQueryKey(asset.id),
            asset,
          );
        }
        return parsedResults;
      } catch (err: any) {
        console.log(err.message);
        return parsedResults;
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
}

const getFilters = (ownerAddress: string): GetProgramAccountsFilter[] => {
  return [
    {
      dataSize: 165,
    },
    {
      memcmp: {
        offset: 32,
        bytes: new PublicKey(ownerAddress).toBase58(),
      },
    },
  ];
};
