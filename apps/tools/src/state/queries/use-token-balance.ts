import { useAppRpc } from "@/connector/app-rpc";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { useConnector } from "@solana/connector/react";
import { address, isAddress } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

/**
 * The connected wallet's balance in its associated token account of `mint`
 * (Token program), zero when there isn't one.
 */
export function useTokenBalance(mint: string) {
  const { account } = useConnector();
  const { rpc, network } = useAppRpc();

  return useQuery({
    enabled: !!account && !!rpc && isAddress(mint),
    queryKey: ["token-balance", network, account, mint],
    queryFn: async () => {
      if (!account || !rpc) throw Error("No address provided");
      const [ata] = await findAssociatedTokenPda({
        owner: account,
        mint: address(mint),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      try {
        const { value } = await rpc
          .getTokenAccountBalance(ata, { commitment: "confirmed" })
          .send();
        return { uiAmount: value.uiAmount ?? 0, amount: value.amount };
      } catch {
        return { uiAmount: 0, amount: "0" };
      }
    },
  });
}
