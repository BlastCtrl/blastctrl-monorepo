import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const tokenAccountExistenceQueryKey = (
  mintAddress: string,
  recipients: string[]
) => ["token-account-existence", mintAddress, recipients] as const;

export function useTokenAccountExistence(
  mintAddress: string,
  recipients: string[]
) {
  const { connection } = useConnection();

  return useQuery({
    enabled: !!mintAddress && recipients.length > 0,
    queryKey: tokenAccountExistenceQueryKey(mintAddress, recipients),
    queryFn: async () => {
      const mint = new PublicKey(mintAddress);
      const ataAddresses = recipients.map((recipient) =>
        getAssociatedTokenAddressSync(mint, new PublicKey(recipient))
      );

      // Fetch accounts in batches of 100
      const batchSize = 100;
      const results: (boolean)[] = [];

      for (let i = 0; i < ataAddresses.length; i += batchSize) {
        const batch = ataAddresses.slice(i, i + batchSize);
        const accountInfos = await connection.getMultipleAccountsInfo(batch);
        
        // null means account doesn't exist, needs to be created
        // non-null means account exists, no creation needed
        const batchResults = accountInfos.map(accountInfo => accountInfo !== null);
        results.push(...batchResults);
      }

      return {
        recipients: recipients.map((recipient, index) => ({
          address: recipient,
          exists: results[index] ?? false,
        })),
        accountsToCreate: results.filter(exists => !exists).length,
        totalRecipients: recipients.length,
      };
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}