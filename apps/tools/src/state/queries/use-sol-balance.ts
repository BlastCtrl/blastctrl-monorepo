import { useAppRpc } from "@/connector/app-rpc";
import { lamportsToSol } from "@/lib/solana/common";
import { useConnector } from "@solana/connector/react";
import { useQuery } from "@tanstack/react-query";

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
      return lamportsToSol(value);
    },
  });
}
