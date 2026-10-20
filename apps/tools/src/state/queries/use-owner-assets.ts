import { useAppRpc } from "@/connector/app-rpc";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-programs";
import {
  AccountState,
  getTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { address, getBase64Encoder } from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchAssetData } from "./use-asset-data";

export type ParsedTokenAccount = {
  token_account: string;
  mint: string;
  balance: bigint;
  isFrozen: boolean;
  token_program: string;
};

export const ownerAssetsKey = (address: string) =>
  ["owner-assets", address] as const;

/** Token (and Token-2022) accounts owned by `owner`. Disabled by default; call `refetch()`. */
export function useOwnerAssets(owner: string) {
  const { rpc, dasAvailable, network } = useAppRpc();
  const queryClient = useQueryClient();

  return useQuery<ParsedTokenAccount[]>({
    queryKey: ownerAssetsKey(owner),
    enabled: false,
    queryFn: async () => {
      if (!owner) throw Error("No address provided");
      if (!rpc) throw Error("RPC not available");
      const ownerAddress = address(owner);

      const [legacy, token2022] = await Promise.all([
        rpc
          .getProgramAccounts(TOKEN_PROGRAM_ADDRESS, {
            encoding: "base64",
            filters: [
              { dataSize: 165n },
              {
                memcmp: {
                  offset: 32n,
                  bytes: ownerAddress,
                  encoding: "base58",
                },
              },
            ],
          })
          .send(),
        rpc
          .getTokenAccountsByOwner(
            ownerAddress,
            { programId: TOKEN_2022_PROGRAM_ADDRESS },
            { encoding: "base64" },
          )
          .send(),
      ]);

      // Token-2022 accounts carry extensions after the base layout; the
      // fixed-size decoder reads only the base, like AccountLayout did.
      const decoder = getTokenDecoder();
      const base64 = getBase64Encoder();
      const parsedResults = [...legacy, ...token2022.value].map(
        ({ pubkey, account }) => {
          const parsed = decoder.decode(base64.encode(account.data[0]));
          return {
            token_account: pubkey,
            mint: parsed.mint,
            balance: parsed.amount,
            isFrozen: parsed.state === AccountState.Frozen,
            token_program: account.owner,
          };
        },
      );

      // Metadata for the empty accounts the list renders. It is cosmetic, so
      // a DAS failure must not fail the scan.
      await prefetchAssetData(
        { rpc, dasAvailable, network },
        queryClient,
        parsedResults.filter((v) => v.balance === 0n).map((v) => v.mint),
      );
      return parsedResults;
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
}
