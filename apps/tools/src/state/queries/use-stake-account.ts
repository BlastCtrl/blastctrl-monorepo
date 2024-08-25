import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

export function useStakeAccount(address = "") {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["stake-account", address],
    enabled: false,
    retry: 3,
    gcTime: 30000,
    queryFn: async () => {
      if (!address) throw Error("No address");
      const addressPubkey = new PublicKey(address);

      const accountData = await connection.getParsedAccountInfo(addressPubkey);
      if (!accountData.value?.data || accountData.value?.data instanceof Buffer)
        throw Error("Account not found");

      const result = stakeAccountSchema.safeParse(accountData.value?.data);
      if (result.error) {
        throw Error("Failed to parse account");
      }

      return { lamports: accountData.value.lamports, data: result.data.parsed };
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
      stake: z.object({
        creditsObserved: z.number().nonnegative(),
        delegation: z.object({
          activationEpoch: z.string(),
          deactivationEpoch: z.string(),
          stake: z.string(),
          voter: z.string(),
          warmupCooldownRate: z.number().nonnegative(),
        }),
      }),
    }),
    type: z.string(),
  }),
  program: z.string(),
  space: z.number().nonnegative(),
});

export type StakeAccountType = {
  lamports: number;
  data: z.infer<typeof stakeAccountSchema>["parsed"];
};
