import { useMutation, useQuery } from "@tanstack/react-query";
import { useSolace } from "./solace-provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { SolaceError } from "./common";
import {
  GetAirdropsIdResponseOK,
  PostAirdropsIdStartResponseOK,
  PostAirdropsResponseCreated,
  type PostAirdropsRequest,
} from "@blastctrl/solace";

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

function getAirdropByIdTransformer(data: GetAirdropsIdResponseOK) {
  let type: "same" | "different";
  const recipients = data.transactions.flatMap((t) => t.recipients);

  if (recipients.length === 0) {
    type = "same";
  } else {
    const amounts = new Set(recipients.map((r) => r.lamports));
    type = amounts.size === 1 ? "same" : "different";
  }

  return {
    ...data,
    type,
    lamportsPerUser:
      type === "same"
        ? data.transactions[0]?.recipients?.[0]?.lamports
        : undefined,
  };
}

export function useGetAirdropById(airdropId: string, hasStarted?: boolean) {
  const sdk = useSolace();

  return useQuery({
    refetchInterval: (query) => {
      if (
        query?.state?.data?.status === "failed" ||
        query?.state?.data?.status === "completed"
      ) {
        return false;
      }
      if (query?.state?.data?.status === "processing" || hasStarted) {
        return 1000;
      } else {
        return false;
      }
    },
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
    select: getAirdropByIdTransformer,
  });
}

export function useCreateAirdrop() {
  const sdk = useSolace();

  return useMutation<
    PostAirdropsResponseCreated,
    SolaceError,
    Omit<PostAirdropsRequest, "authorization">
  >({
    mutationKey: ["createAirdrop"],
    mutationFn: async (data) => {
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

  return useMutation<
    PostAirdropsIdStartResponseOK,
    SolaceError,
    { airdropId: string }
  >({
    mutationKey: ["startAirdrop"],
    mutationFn: async (data) => {
      const response = await sdk.postAirdropsIdStart({
        id: data.airdropId,
      });

      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
  });
}
