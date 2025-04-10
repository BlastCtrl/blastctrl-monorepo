import { useMutation, useQuery } from "@tanstack/react-query";
import { useSolace } from "./solace-provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { SolaceError } from "./common";
import { type PostAirdropsRequest } from "@blastctrl/solace";

export function useGetAirdrops() {
  const sdk = useSolace();
  const { publicKey } = useWallet();

  return useQuery({
    retry: 1,
    enabled: !!publicKey,
    queryKey: ["airdrops", "all", publicKey?.toString()],
    queryFn: async () => {
      const response = await sdk.getAirdrops({});
      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
  });
}

export function useGetAirdropById(airdropId: string) {
  const sdk = useSolace();

  return useQuery({
    queryKey: ["airdrops", "single", airdropId],
    queryFn: async () => {
      const response = await sdk.getAirdropsId({
        id: airdropId,
      });

      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
    select: (data) => {
      // check if all recipients are getting the same amount or not
      let type: "same" | "different";
      const recipients = data.transactions.flatMap((t) => t.recipients);

      if (recipients.length === 0) {
        type = "same";
      } else {
        const amounts = new Set(recipients.map((r) => r.lamports));
        type = amounts.size === 1 ? "same" : "different";
      }

      return { ...data, type };
    },
  });
}

export function useCreateAirdrop() {
  const sdk = useSolace();

  return useMutation({
    mutationKey: ["createAirdrop"],
    mutationFn: async (data: Omit<PostAirdropsRequest, "authorization">) => {
      const response = await sdk.postAirdrops(data);
      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
  });
}

export function useStartAirdrop() {
  const sdk = useSolace();

  return useMutation({
    mutationKey: ["startAirdrop"],
    mutationFn: async (airdropId: string) => {
      const response = await sdk.postAirdropsIdStart({
        id: airdropId,
      });

      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
  });
}
