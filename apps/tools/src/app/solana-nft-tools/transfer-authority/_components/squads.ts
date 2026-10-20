import { useAppRpc } from "@/connector/app-rpc";
import {
  isSquadsMultisigAccount,
  squadsVault,
} from "@/lib/solana/squads-multisig";
import { address, fetchEncodedAccount, isAddress } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

/**
 * Squads executes each transaction in a proposal inside one instruction of
 * its own, which gets the default 200,000 compute units unless whoever
 * executes it asks for more. Members may execute from the Squads app, which
 * may not ask for more, so batch transactions stay within the default.
 *
 * On devnet, 5 verifications took 118,305 units and 10 ran out.
 */
export const MAX_VERIFICATIONS_PER_SQUADS_TRANSACTION = 5;

/**
 * Two transfers took about 98,000 units on devnet, roughly 40,000 each over
 * Squads' own overhead. Transfers that change creators already stop at 2 by
 * size (adding them to the batch takes about 1,014 bytes); this caps the
 * smaller ones that leave creators alone.
 */
export const MAX_TRANSFERS_PER_SQUADS_TRANSACTION = 3;

/** Asked for when this tool executes, for headroom over the default. */
export const EXECUTE_COMPUTE_UNITS = 400_000;

/**
 * Whether an address is a Squads multisig account rather than a vault, and
 * if so, the address of its first vault.
 */
export function useSquadsMultisig(candidate: string) {
  const { rpc, network } = useAppRpc();
  return useQuery({
    queryKey: ["squads-multisig", network, candidate],
    enabled: !!rpc && isAddress(candidate),
    queryFn: async () => {
      if (!rpc) throw Error("RPC not available");
      const multisigAddress = address(candidate);
      const account = await fetchEncodedAccount(rpc, multisigAddress);
      return account.exists && isSquadsMultisigAccount(account)
        ? { vault: squadsVault(multisigAddress) }
        : null;
    },
    staleTime: Infinity,
  });
}
