import { useAppRpc } from "@/connector/app-rpc";
import { lamportsToSol } from "@/lib/solana/common";
import { useConnector } from "@solana/connector/react";
import { useQuery } from "@tanstack/react-query";

/** The connected wallet's confirmed balance, in SOL. */
export function useSolBalance() {
  const { account } = useConnector();
  const { rpc, network } = useAppRpc();

  return useQuery({
    queryKey: ["sol-balance", account, network],
    enabled: !!account && !!rpc,
    queryFn: async () => {
      if (!account || !rpc) return 0;
      const { value } = await rpc
        .getBalance(account, { commitment: "confirmed" })
        .send();
      return lamportsToSol(value);
    },
  });
}
