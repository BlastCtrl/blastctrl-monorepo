import { useAppRpc } from "@/connector/app-rpc";
import { chunk } from "@/lib/utils";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { address, type Address } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";

export const tokenAccountExistenceQueryKey = (
  mintAddress: string,
  recipients: string[],
  tokenProgram: Address,
  network: string,
) =>
  [
    "token-account-existence",
    mintAddress,
    recipients,
    tokenProgram,
    network,
  ] as const;

/** Which recipients already have an associated token account for `mintAddress`. */
export function useTokenAccountExistence(
  mintAddress: string,
  recipients: string[],
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
) {
  const { rpc, network } = useAppRpc();

  return useQuery({
    enabled: !!mintAddress && recipients.length > 0 && !!rpc,
    queryKey: tokenAccountExistenceQueryKey(
      mintAddress,
      recipients,
      tokenProgram,
      network,
    ),
    queryFn: async ({ signal }) => {
      if (!rpc) throw new Error("RPC not available");
      const mint = address(mintAddress);
      const atas = await Promise.all(
        recipients.map(
          async (recipient) =>
            (
              await findAssociatedTokenPda({
                owner: address(recipient),
                mint,
                tokenProgram,
              })
            )[0],
        ),
      );

      // getMultipleAccounts takes at most 100 addresses; we only need existence.
      const exists: boolean[] = [];
      for (const batch of chunk(atas, 100)) {
        const { value } = await rpc
          .getMultipleAccounts(batch, {
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 },
          })
          .send({ abortSignal: signal });
        exists.push(...value.map((account) => account !== null));
      }

      return {
        recipients: recipients.map((recipient, index) => ({
          address: recipient,
          exists: exists[index] ?? false,
        })),
        accountsToCreate: exists.filter((e) => !e).length,
        totalRecipients: recipients.length,
      };
    },
    staleTime: 30_000,
  });
}
