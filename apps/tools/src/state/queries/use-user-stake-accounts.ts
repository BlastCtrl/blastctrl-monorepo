import { useConnection } from "@solana/wallet-adapter-react";
import { StakeProgram } from "@solana/web3.js";
import type {
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
} from "@solana/web3.js";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";

const META_AUTHORIZED_STAKER_OFFSET = 12;
const META_AUTHORIZED_WITHDRAWER_OFFSET = 44;

export function userStakeAccountsQuery(
  connection: Connection,
  withdrawer?: PublicKey,
  staker?: PublicKey,
) {
  withdrawer ??= staker;
  return queryOptions({
    enabled: !!staker,
    staleTime: Infinity,
    retry: 1,
    retryOnMount: false,
    queryKey: [
      "user-stake-accounts",
      staker?.toString(),
      withdrawer?.toString(),
    ],
    queryFn: async () => {
      if (!staker) {
        throw Error("Missing publicKey");
      }

      const filters: GetProgramAccountsFilter[] = [];
      if (staker) {
        filters.push({
          memcmp: {
            offset: META_AUTHORIZED_STAKER_OFFSET,
            bytes: staker.toBase58(),
          },
        });
      }
      if (withdrawer) {
        filters.push({
          memcmp: {
            offset: META_AUTHORIZED_WITHDRAWER_OFFSET,
            bytes: withdrawer.toBase58(),
          },
        });
      }

      const parsedStakeAccounts = await connection.getParsedProgramAccounts(
        StakeProgram.programId,
        {
          commitment: "confirmed",
          filters,
        },
      );

      return parsedStakeAccounts
        .map(({ pubkey, account }) => {
          try {
            const casted = stakeAccountSchema.parse(account.data);
            return {
              accountId: pubkey,
              lamports: account.lamports,
              data: casted.parsed,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as StakeAccountType[];
    },
  });
}

export function useUserStakeAccounts(
  withdrawer?: PublicKey,
  staker?: PublicKey,
) {
  const { connection } = useConnection();
  // withdrawer ??= staker;

  return useQuery({
    enabled: !!withdrawer,
    staleTime: Infinity,
    retry: 1,
    retryOnMount: false,
    queryKey: [
      "user-stake-accounts",
      withdrawer?.toString(),
      staker?.toString(),
    ],
    queryFn: async () => {
      if (!withdrawer) {
        throw Error("Missing publicKey");
      }

      const filters: GetProgramAccountsFilter[] = [];
      if (withdrawer) {
        filters.push({
          memcmp: {
            offset: META_AUTHORIZED_WITHDRAWER_OFFSET,
            bytes: withdrawer.toBase58(),
          },
        });
      }
      if (staker) {
        filters.push({
          memcmp: {
            offset: META_AUTHORIZED_STAKER_OFFSET,
            bytes: staker.toBase58(),
          },
        });
      }

      const parsedStakeAccounts = await connection.getParsedProgramAccounts(
        StakeProgram.programId,
        {
          commitment: "confirmed",
          filters,
        },
      );

      return parsedStakeAccounts
        .map(({ pubkey, account }) => {
          try {
            const casted = stakeAccountSchema.parse(account.data);
            return {
              accountId: pubkey,
              lamports: account.lamports,
              data: casted.parsed,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as StakeAccountType[];
    },
  });
}

export const stakeAccountSchema = z.object({
  parsed: z.object({
    info: z.object({
      meta: z.object({
        authorized: z.object({
          staker: z.string(),
          withdrawer: z.string(),
        }),
        lockup: z.object({
          custodian: z.string(),
          epoch: z.number().nonnegative(),
          unixTimestamp: z.number().nonnegative(),
        }),
        rentExemptReserve: z.string(),
      }),
      stake: z
        .object({
          creditsObserved: z.number().nonnegative(),
          delegation: z.object({
            activationEpoch: z.string(),
            deactivationEpoch: z.string(),
            stake: z.string(),
            voter: z.string(),
            warmupCooldownRate: z.number().nonnegative(),
          }),
        })
        .nullable(),
    }),
    type: z.string(),
  }),
  program: z.string(),
  space: z.number().nonnegative(),
});

export type StakeAccountType = {
  accountId: PublicKey;
  lamports: number;
  data: z.infer<typeof stakeAccountSchema>["parsed"];
};
