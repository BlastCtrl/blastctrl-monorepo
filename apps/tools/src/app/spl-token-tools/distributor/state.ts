import { useMutation, useQuery } from "@tanstack/react-query";
import { useSolace } from "./solace-provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { SolaceError } from "./common";
import type {
  PostAirdrops201,
  PostAirdropsAirdropIdRetryBatchBatchIdBody,
  PostAirdropsBody,
  PostAirdropsIdStart200,
  PostAirdropsIdStartBodyItem,
  GetAirdropsId200,
} from "@blastctrl/solace-sdk";

export function useGetAirdrops() {
  const sdk = useSolace();
  const { publicKey } = useWallet();

  return useQuery({
    retry: 1,
    enabled: !!publicKey,
    queryKey: ["airdrops", "all", publicKey?.toString()],
    queryFn: async () => {
      const response = await sdk.api.getAirdrops();
      if (response.status !== 200) {
        throw new SolaceError(response.data);
      }
      return response.data;
    },
  });
}

function getAirdropByIdTransformer(data: GetAirdropsId200) {
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
      const response = await sdk.api.getAirdropsId(airdropId);

      if (response.status !== 200) {
        throw new SolaceError(response.data);
      }
      return response.data;
    },
    retry: 1,
    select: getAirdropByIdTransformer,
  });
}

export function useCreateAirdrop() {
  const sdk = useSolace();

  return useMutation<PostAirdrops201, SolaceError, PostAirdropsBody>({
    mutationKey: ["createAirdrop"],
    mutationFn: async (data) => {
      const response = await sdk.api.postAirdrops(data);
      if (response.status !== 201) {
        throw new SolaceError(response.data);
      }
      return response.data;
    },
  });
}

export function useStartAirdrop(airdropId: string) {
  const sdk = useSolace();

  return useMutation<
    PostAirdropsIdStart200,
    SolaceError,
    PostAirdropsIdStartBodyItem[]
  >({
    mutationKey: ["startAirdrop"],
    mutationFn: async (data) => {
      const response = await sdk.api.postAirdropsIdStart(airdropId, data);

      if (response.status !== 200) {
        throw new SolaceError(response.data);
      }
      return response.data;
    },
  });
}

export function useRetryTransaction(airdropId: string, batchId: string) {
  const sdk = useSolace();

  return useMutation({
    mutationKey: ["retry"],
    mutationFn: async (data: PostAirdropsAirdropIdRetryBatchBatchIdBody) => {
      const response = await sdk.api.postAirdropsAirdropIdRetryBatchBatchId(
        airdropId,
        batchId,
        data,
      );

      if (response.status !== 200) {
        throw new SolaceError(response.data);
      }

      return response.data;
    },
  });
}
