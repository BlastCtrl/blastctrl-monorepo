import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface StakeTransaction {
  id: string;
  index: number;
  amount: number; // in lamports
  status: "pending" | "processing" | "confirmed" | "failed";
  signature?: string;
  error?: string;
  timestamp: number;
}

type CreateStakeTransactionState = {
  transactions: StakeTransaction[];
  isProcessing: boolean;
  totalTransactions: number;
  completedTransactions: number;
};

type CreateStakeTransactionActions = {
  initializeTransactions: (
    transactions: Omit<StakeTransaction, "status" | "timestamp">[],
  ) => void;
  updateTransactionStatus: (
    id: string,
    status: StakeTransaction["status"],
    signature?: string,
    error?: string,
  ) => void;
  resetTransactions: () => void;
  setProcessing: (isProcessing: boolean) => void;
};

type CreateStakeTransactionStore = {
  state: CreateStakeTransactionState;
  actions: CreateStakeTransactionActions;
};

const INITIAL_STATE: CreateStakeTransactionState = {
  transactions: [],
  isProcessing: false,
  totalTransactions: 0,
  completedTransactions: 0,
};

export const useCreateStakeTransactionStore =
  create<CreateStakeTransactionStore>()(
    immer((set) => ({
      state: INITIAL_STATE,
      actions: {
        initializeTransactions: (transactions) =>
          set((s) => {
            s.state.transactions = transactions.map((tx) => ({
              ...tx,
              status: "pending" as const,
              timestamp: Date.now(),
            }));
            s.state.totalTransactions = transactions.length;
            s.state.completedTransactions = 0;
            s.state.isProcessing = true;
          }),

        updateTransactionStatus: (id, status, signature, error) =>
          set((s) => {
            const transaction = s.state.transactions.find((tx) => tx.id === id);
            if (transaction) {
              transaction.status = status;
              if (signature) transaction.signature = signature;
              if (error) transaction.error = error;

              // Update completed count
              s.state.completedTransactions = s.state.transactions.filter(
                (tx) => tx.status === "confirmed" || tx.status === "failed",
              ).length;
            }
          }),

        resetTransactions: () =>
          set((s) => {
            s.state.transactions = [];
            s.state.isProcessing = false;
            s.state.totalTransactions = 0;
            s.state.completedTransactions = 0;
          }),

        setProcessing: (isProcessing) =>
          set((s) => {
            s.state.isProcessing = isProcessing;
          }),
      },
    })),
  );

export const useCreateStakeTransactionActions = () =>
  useCreateStakeTransactionStore((s) => s.actions);

export const useCreateStakeTransactionState = () =>
  useCreateStakeTransactionStore((s) => s.state);
