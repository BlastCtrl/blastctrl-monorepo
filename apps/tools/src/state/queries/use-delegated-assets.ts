import { useAppRpc } from "@/connector/app-rpc";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@/lib/solana/token-2022";
import {
  AccountState,
  getTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  getBase64Encoder,
  isSome,
  type Base64EncodedBytes,
} from "@solana/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchAssetData } from "./use-asset-data";

export type ParsedDelegatedTokenAccount = {
  token_account: string;
  mint: string;
  balance: bigint;
  isFrozen: boolean;
  token_program: string;
  delegate: string;
  delegated_amount: bigint;
};

export const delegatedAssetsKey = (address: string) =>
  ["delegated-assets", address] as const;

/**
 * `COption::Some` tag (`u32` 1, little-endian) of the Token account's
 * `delegate` field at offset 72, so the RPC only returns delegated accounts.
 */
const DELEGATE_SOME_TAG = "AQAAAA==" as Base64EncodedBytes;

/**
 * Token (and Token-2022) accounts owned by `owner` that have a delegate set.
 * Disabled by default; call `refetch()`.
 */
export function useDelegatedAssets(owner: string) {
  const { rpc, dasAvailable, network } = useAppRpc();
  const queryClient = useQueryClient();

  return useQuery<ParsedDelegatedTokenAccount[]>({
    queryKey: delegatedAssetsKey(owner),
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
              {
                memcmp: {
                  offset: 72n,
                  bytes: DELEGATE_SOME_TAG,
                  encoding: "base64",
                },
              },
            ],
          })
          .send(),
        // Token-2022 accounts have a variable size (extensions), so they are
        // listed by owner and filtered after decoding.
        rpc
          .getTokenAccountsByOwner(
            ownerAddress,
            { programId: TOKEN_2022_PROGRAM_ADDRESS },
            { encoding: "base64" },
          )
          .send(),
      ]);

      // The fixed-size decoder reads only the base layout, which is all the
      // list needs; Token-2022 extensions follow it and are ignored.
      const decoder = getTokenDecoder();
      const base64 = getBase64Encoder();
      const parsedResults: ParsedDelegatedTokenAccount[] = [];
      for (const { pubkey, account } of [...legacy, ...token2022.value]) {
        const parsed = decoder.decode(base64.encode(account.data[0]));
        if (!isSome(parsed.delegate)) continue;
        parsedResults.push({
          token_account: pubkey,
          mint: parsed.mint,
          balance: parsed.amount,
          isFrozen: parsed.state === AccountState.Frozen,
          token_program: account.owner,
          delegate: parsed.delegate.value,
          delegated_amount: parsed.delegatedAmount,
        });
      }

      // Metadata for the rows the list renders. It is cosmetic, so a DAS
      // failure must not fail the scan.
      await prefetchAssetData(
        { rpc, dasAvailable, network },
        queryClient,
        parsedResults.map((v) => v.mint),
      );
      return parsedResults;
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
}
