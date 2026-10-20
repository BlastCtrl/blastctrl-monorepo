import { notify } from "@/components/notification";
import { withMinimumTime } from "@/lib/utils";
import type {
  CreateAirdrop201,
  CreateAirdropBody,
  CreateTokenAirdrop201,
  CreateTokenAirdropBody,
  GetAirdrop200,
  ListAirdrops200Item,
  RetryAirdropTransactionBody,
  StartAirdrop200,
  StartAirdropBodyItem,
} from "@blastctrl/solace-sdk";
import { useConnector } from "@solana/connector/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SolaceError } from "./common";
import { useSolace } from "./solace-provider";

export const airdropsQueryKey = (account: string | null) =>
  ["airdrops", "all", account] as const;

export function useGetAirdrops() {
  const sdk = useSolace();
  const { account } = useConnector();

  return useQuery<ListAirdrops200Item[], SolaceError>({
    retry: 1,
    enabled: !!account,
    queryKey: airdropsQueryKey(account),
    queryFn: async ({ signal }) => {
      const response = await sdk.api.listAirdrops({ signal });
      if (response.status !== 200) throw SolaceError.fromResponse(response);
      return response.data;
    },
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
    queryFn: async ({ signal }) => {
      const response = await sdk.api.getAirdrop(airdropId, { signal });
      if (response.status !== 200) throw SolaceError.fromResponse(response);
      return response.data;
    },
    retry: 1,
    select: getAirdropByIdTransformer,
  });
}

export function useCreateAirdrop() {
  const sdk = useSolace();

  return useMutation<CreateAirdrop201, SolaceError, CreateAirdropBody>({
    mutationKey: ["createAirdrop"],
    mutationFn: async (data) => {
      const response = await withMinimumTime(sdk.api.createAirdrop(data), 500);
      if (response.status !== 201) throw SolaceError.fromResponse(response);
      return response.data;
    },
  });
}

export function useCreateTokenAirdrop() {
  const sdk = useSolace();

  return useMutation<
    CreateTokenAirdrop201,
    SolaceError,
    CreateTokenAirdropBody
  >({
    mutationKey: ["createTokenAirdrop"],
    mutationFn: async (data) => {
      const response = await withMinimumTime(
        sdk.api.createTokenAirdrop(data),
        500,
      );
      if (response.status !== 201) throw SolaceError.fromResponse(response);
      return response.data;
    },
  });
}

export function useStartAirdrop(airdropId: string) {
  const sdk = useSolace();

  return useMutation<StartAirdrop200, SolaceError, StartAirdropBodyItem[]>({
    mutationKey: ["startAirdrop"],
    mutationFn: async (data) => {
      const response = await sdk.api.startAirdrop(airdropId, data);
      if (response.status !== 200) throw SolaceError.fromResponse(response);
      return response.data;
    },
  });
}

export function useRetryTransaction(airdropId: string, batchId: string) {
  const sdk = useSolace();

  return useMutation({
    mutationKey: ["retry", airdropId, batchId],
    mutationFn: async (data: RetryAirdropTransactionBody) => {
      const response = await sdk.api.retryAirdropTransaction(
        airdropId,
        batchId,
        data,
      );
      if (response.status !== 200) throw SolaceError.fromResponse(response);
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
        data: RetryAirdropTransactionBody;
      }>,
    ) => {
      const responses = await Promise.allSettled(
        data.map((batchData) =>
          sdk.api.retryAirdropTransaction(
            airdropId,
            batchData.batchId.toString(),
            batchData.data,
          ),
        ),
      );

      if (
        responses.some(
          (response) =>
            response.status === "rejected" ||
            (response.status === "fulfilled" && response.value.status !== 200),
        )
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
      const response = await sdk.api.deleteAirdrop(id);
      if (response.status !== 204) throw SolaceError.fromResponse(response);
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
  const { account } = useConnector();
  const queryKey = airdropsQueryKey(account);

  return useMutation({
    mutationKey: ["set-label"],
    mutationFn: async (label: string) => {
      const response = await sdk.api.setAirdropLabel(airdropId, { label });
      if (response.status !== 200) throw SolaceError.fromResponse(response);
      return response.data;
    },
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
