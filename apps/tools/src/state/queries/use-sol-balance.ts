import { useAppRpc } from "@/connector/app-rpc";
import { useConnector } from "@solana/connector/react";
import { useQuery } from "@tanstack/react-query";
import { lamportsToSol } from "@solana/kit";
import { decimalFixedPointToNumber } from "@solana/fixed-points";

export const solBalanceKey = (account: string | null, network?: string) =>
  network === undefined
    ? (["sol-balance", account] as const)
    : (["sol-balance", account, network] as const);

export function useSolBalance() {
  const { account } = useConnector();
  const { rpc, network } = useAppRpc();

  return useQuery({
    queryKey: solBalanceKey(account, network),
    enabled: !!account && !!rpc,
    queryFn: async ({ signal }) => {
      if (!account || !rpc) return 0;
      const { value } = await rpc
        .getBalance(account, { commitment: "confirmed" })
        .send({ abortSignal: signal });
      return decimalFixedPointToNumber(lamportsToSol(value));
    },
  });
}
