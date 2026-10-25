import { useSolanaClient } from "@solana/connector/react";
import {
  decodeStakeStateAccount,
  STAKE_PROGRAM_ADDRESS,
} from "@solana-program/stake";
import {
  parseBase64RpcAccount,
  type Address,
  type GetProgramAccountsApi,
  type GetProgramAccountsMemcmpFilter,
  type Rpc,
} from "@solana/kit";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { toStakeAccount, type StakeAccountType } from "./use-stake-account";

export type { StakeAccountType } from "./use-stake-account";

// Byte offsets into `StakeStateV2` for the Initialized/Stake variants:
// u32 discriminator (4) + rent_exempt_reserve u64 (8) = 12 → staker, then withdrawer.
const META_AUTHORIZED_STAKER_OFFSET = 12n;
const META_AUTHORIZED_WITHDRAWER_OFFSET = 44n;

const memcmp = (
  offset: bigint,
  pubkey: Address,
): GetProgramAccountsMemcmpFilter => ({
  memcmp: { offset, bytes: pubkey, encoding: "base58" },
});

/**
 * Stake accounts whose authorities match the given keys. Either key may be
 * omitted; the query is disabled when both are.
 */
export function userStakeAccountsQuery(
  rpc: Rpc<GetProgramAccountsApi> | null,
  { withdrawer, staker }: { withdrawer?: Address; staker?: Address },
) {
  return queryOptions({
    enabled: rpc !== null && (!!withdrawer || !!staker),
    staleTime: Infinity,
    retry: 1,
    retryOnMount: false,
    queryKey: ["user-stake-accounts", withdrawer, staker],
    queryFn: async (): Promise<StakeAccountType[]> => {
      if (!rpc) throw Error("RPC not available");
      if (!withdrawer && !staker) throw Error("Missing authority");

      const filters: GetProgramAccountsMemcmpFilter[] = [];
      if (withdrawer)
        filters.push(memcmp(META_AUTHORIZED_WITHDRAWER_OFFSET, withdrawer));
      if (staker) filters.push(memcmp(META_AUTHORIZED_STAKER_OFFSET, staker));

      const accounts = await rpc
        .getProgramAccounts(STAKE_PROGRAM_ADDRESS, {
          commitment: "confirmed",
          encoding: "base64",
          filters,
        })
        .send();

      const result: StakeAccountType[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          result.push(
            toStakeAccount(
              decodeStakeStateAccount(parseBase64RpcAccount(pubkey, account)),
            ),
          );
        } catch {
          // Skip anything that is not an initialized stake account.
        }
      }
      return result;
    },
  });
}

export function useUserStakeAccounts(withdrawer?: Address, staker?: Address) {
  const { client } = useSolanaClient();
  return useQuery(
    userStakeAccountsQuery(client?.rpc ?? null, { withdrawer, staker }),
  );
}
