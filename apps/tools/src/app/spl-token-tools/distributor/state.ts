import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  GetAirdrops200Item,
} from "@blastctrl/solace-sdk";
import { notify } from "@/components/notification";
import { withMinimumTime } from "@/lib/utils";

export function useGetAirdrops() {
  const sdk = useSolace();
  const { publicKey } = useWallet();

  return useQuery<GetAirdrops200Item[], SolaceError>({
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

  // Add counter property to each transaction
  const transactionsWithCounter = data.transactions.map(
    (transaction, index) => ({
      ...transaction,
      counter: index,
    }),
  );

  return {
    ...data,
    transactions: transactionsWithCounter,
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
      if (!query.state) {
        return hasStarted ? 1200 : false;
      }

      const data = query.state.data;
      // Refresh if processing or any transactions confirming
      if (data?.transactions?.some((tx) => tx.status === "confirming")) {
        return 1200;
      }

      return false;
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
      const response = await withMinimumTime(sdk.api.postAirdrops(data), 500);
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
    mutationKey: ["retry", airdropId, batchId],
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
export function useRetryMany(airdropId: string) {
  const sdk = useSolace();

  return useMutation({
    mutationKey: ["retry-many", airdropId],
    mutationFn: async (
      data: Array<{
        batchId: number;
        data: PostAirdropsAirdropIdRetryBatchBatchIdBody;
      }>,
    ) => {
      const responses = await Promise.allSettled(
        data.map((batchData) =>
          sdk.api.postAirdropsAirdropIdRetryBatchBatchId(
            airdropId,
            batchData.batchId.toString(),
            batchData.data,
          ),
        ),
      );

      if (
        responses.some((response) => {
          response.status === "rejected" ||
            (response.status === "fulfilled" && response.value.status !== 200);
        })
      ) {
        throw new Error("Some retry requests were rejected.");
      }

      return responses;
    },
    onError: (err) => {
      notify({
        type: "error",
        title: "Retry all failed",
        description: err.message,
      });
    },
  });
}

export function useDeleteAirdrop() {
  const sdk = useSolace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["delete"],
    mutationFn: async ({ id }: { id: string }) => {
      const response = await sdk.api.deleteAirdropsId(id);

      if (response.status !== 204) {
        throw new SolaceError(response.data);
      }

      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["airdrops"],
        exact: false,
        type: "all",
      });
    },
    onError: (error) => {
      const [title, message] =
        error instanceof SolaceError
          ? [error.error, error.message]
          : [undefined, error.message];
      notify({ type: "error", title, description: message });
    },
  });
}

export function useSetLabel(airdropId: string) {
  const sdk = useSolace();
  const queryClient = useQueryClient();
  const { publicKey } = useWallet();
  const queryKey = ["airdrops", "all", publicKey?.toString()];

  return useMutation({
    mutationKey: ["set-label"],
    mutationFn: async (label: string) => {
      const response = await sdk.api.postAirdropsAirdropIdSetLabel(airdropId, {
        label,
      });

      if (response.status !== 200) {
        throw new SolaceError(response.data);
      }

      return response.data;
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["airdrops"] });
      const previousAirdrops =
        queryClient.getQueryData<GetAirdrops200Item[]>(queryKey);
      if (!previousAirdrops) return;
      const updatedAirdrops = previousAirdrops.map((a) =>
        a.id === airdropId ? { ...a, label: data } : a,
      );

      queryClient.setQueryData(queryKey, updatedAirdrops);
      return { previousAirdrops };
    },
    onError: (error, _label, context) => {
      queryClient.setQueryData(queryKey, context?.previousAirdrops);
      const [title, message] =
        error instanceof SolaceError
          ? [error.error, error.message]
          : [undefined, error.message];
      notify({ type: "error", title, description: message });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["airdrops"],
        exact: false,
        type: "all",
      });
    },
  });
}
