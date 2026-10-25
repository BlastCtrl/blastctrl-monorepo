import { notify } from "@/components/notification";
import { withMinimumTime } from "@/lib/utils";
import {
  createAirdrop,
  createTokenAirdrop,
  deleteAirdrop,
  getAirdrop,
  listAirdrops,
  retryAirdropTransaction,
  setAirdropLabel,
  SolaceApiError,
  startAirdrop,
  type GetAirdrop200,
  type ListAirdrops200Item,
  type RetryAirdropTransactionBody,
} from "@blastctrl/solace-sdk";
import { useConnector } from "@solana/connector/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSolaceAuth } from "./solace-provider";

export const airdropsQueryKey = (account: string | null) =>
  ["airdrops", "all", account] as const;

/** Title and message for a toast, from an SDK error or anything else thrown. */
const describeError = (error: Error): [string | undefined, string] =>
  error instanceof SolaceApiError
    ? [error.error, error.message]
    : [undefined, error.message];

export function useGetAirdrops() {
  const { requestInit } = useSolaceAuth();
  const { account } = useConnector();

  return useQuery({
    retry: 1,
    enabled: !!account,
    queryKey: airdropsQueryKey(account),
    queryFn: ({ signal }) => listAirdrops({ ...requestInit, signal }),
  });
}

function getAirdropByIdTransformer(data: GetAirdrop200) {
  let type: "same" | "different";
  const recipients = data.transactions.flatMap((t) => t.recipients);

  if (recipients.length === 0) {
    type = "same";
  } else {
    const amounts = new Set(recipients.map((r) => r.atomicAmount));
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
        ? data.transactions[0]?.recipients?.[0]?.atomicAmount
        : undefined,
  };
}

export function useGetAirdropById(airdropId: string, hasStarted?: boolean) {
  const { requestInit } = useSolaceAuth();

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
    queryFn: ({ signal }) => getAirdrop(airdropId, { ...requestInit, signal }),
    retry: 1,
    select: getAirdropByIdTransformer,
  });
}

export function useCreateAirdrop() {
  const { requestInit } = useSolaceAuth();

  return useMutation({
    mutationKey: ["createAirdrop"],
    mutationFn: (data: Parameters<typeof createAirdrop>[0]) =>
      withMinimumTime(createAirdrop(data, requestInit), 500),
  });
}

export function useCreateTokenAirdrop() {
  const { requestInit } = useSolaceAuth();

  return useMutation({
    mutationKey: ["createTokenAirdrop"],
    mutationFn: (data: Parameters<typeof createTokenAirdrop>[0]) =>
      withMinimumTime(createTokenAirdrop(data, requestInit), 500),
  });
}

export function useStartAirdrop(airdropId: string) {
  const { requestInit } = useSolaceAuth();

  return useMutation({
    mutationKey: ["startAirdrop"],
    mutationFn: (data: Parameters<typeof startAirdrop>[1]) =>
      startAirdrop(airdropId, data, requestInit),
  });
}

export function useRetryTransaction(airdropId: string, batchId: string) {
  const { requestInit } = useSolaceAuth();

  return useMutation({
    mutationKey: ["retry", airdropId, batchId],
    mutationFn: (data: RetryAirdropTransactionBody) =>
      retryAirdropTransaction(airdropId, batchId, data, requestInit),
  });
}

export function useRetryMany(airdropId: string) {
  const { requestInit } = useSolaceAuth();

  return useMutation({
    mutationKey: ["retry-many", airdropId],
    mutationFn: async (
      data: Array<{
        batchId: number;
        data: RetryAirdropTransactionBody;
      }>,
    ) => {
      const responses = await Promise.allSettled(
        data.map((batchData) =>
          retryAirdropTransaction(
            airdropId,
            batchData.batchId.toString(),
            batchData.data,
            requestInit,
          ),
        ),
      );

      if (responses.some((response) => response.status === "rejected")) {
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
  const { requestInit } = useSolaceAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["delete"],
    mutationFn: ({ id }: { id: string }) => deleteAirdrop(id, requestInit),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["airdrops"],
        exact: false,
        type: "all",
      });
    },
    onError: (error) => {
      const [title, message] = describeError(error);
      notify({ type: "error", title, description: message });
    },
  });
}

export function useSetLabel(airdropId: string) {
  const { requestInit } = useSolaceAuth();
  const queryClient = useQueryClient();
  const { account } = useConnector();
  const queryKey = airdropsQueryKey(account);

  return useMutation({
    mutationKey: ["set-label"],
    mutationFn: (label: string) =>
      setAirdropLabel(airdropId, { label }, requestInit),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["airdrops"] });
      const previousAirdrops =
        queryClient.getQueryData<ListAirdrops200Item[]>(queryKey);
      if (!previousAirdrops) return;
      const updatedAirdrops = previousAirdrops.map((a) =>
        a.id === airdropId ? { ...a, label: data } : a,
      );

      queryClient.setQueryData(queryKey, updatedAirdrops);
      return { previousAirdrops };
    },
    onError: (error, _label, context) => {
      queryClient.setQueryData(queryKey, context?.previousAirdrops);
      const [title, message] = describeError(error);
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
