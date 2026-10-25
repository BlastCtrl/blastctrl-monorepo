import { useSolanaClient } from "@solana/connector/react";
import {
  fetchStakeStateAccount,
  STAKE_PROGRAM_ADDRESS,
  type Meta,
  type Stake,
  type StakeStateAccount,
} from "@solana-program/stake";
import {
  address,
  type Account,
  type Address,
  type Lamports,
} from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

/** A decoded, initialized stake account. `stake` is null until it is delegated. */
export type StakeAccountType = {
  address: Address;
  lamports: Lamports;
  meta: Meta;
  stake: Stake | null;
};

/**
 * Narrows a decoded stake account to the shape the tools work with.
 * Throws for accounts that are not initialized (or not stake accounts at all).
 */
export function toStakeAccount(
  account: Account<StakeStateAccount>,
): StakeAccountType {
  if (account.programAddress !== STAKE_PROGRAM_ADDRESS) {
    throw Error("Account is not owned by the stake program");
  }
  const { state } = account.data;
  switch (state.__kind) {
    case "Initialized":
      return {
        address: account.address,
        lamports: account.lamports,
        meta: state.fields[0],
        stake: null,
      };
    case "Stake":
      return {
        address: account.address,
        lamports: account.lamports,
        meta: state.fields[0],
        stake: state.fields[1],
      };
    default:
      throw Error(`Stake account is ${state.__kind.toLowerCase()}`);
  }
}

/** Reads and decodes a stake account from the connector's active cluster; no wallet needed. */
export function useStakeAccount(stakeAddress = "", disableOverride = false) {
  const { client } = useSolanaClient();

  return useQuery<StakeAccountType, Error>({
    queryKey: ["stake-account", stakeAddress],
    enabled: !!stakeAddress && !disableOverride && client !== null,
    retry: 1,
    staleTime: 30000,
    gcTime: 30000,
    queryFn: async () => {
      if (!stakeAddress) throw Error("No address");
      if (!client) throw Error("RPC not available");

      // Throws if the account is missing or its data does not decode as a stake state.
      const account = await fetchStakeStateAccount(
        client.rpc,
        address(stakeAddress),
      );
      return toStakeAccount(account);
    },
  });
}
