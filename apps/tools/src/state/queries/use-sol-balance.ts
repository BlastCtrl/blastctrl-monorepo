import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

export function useSolBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery({
    queryKey: ["sol-balance", publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return 0;
      const lamports = await connection.getBalance(publicKey, "confirmed");
      return lamports / LAMPORTS_PER_SOL;
    },
    enabled: !!publicKey,
  });
}
