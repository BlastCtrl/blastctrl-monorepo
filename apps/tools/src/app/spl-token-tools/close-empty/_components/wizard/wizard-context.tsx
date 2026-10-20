import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { getCloseAccountInstruction } from "@solana-program/token";
import { address, type TransactionSigner } from "@solana/kit";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";

/** Close instructions per transaction; also drives the "confirm N transactions" copy. */
export const ACCOUNTS_PER_TRANSACTION = 4;

/** Close `account`, sending its rent to the owner. Works for Token and Token-2022. */
export const closeAccountInstruction = (
  account: ParsedTokenAccount,
  owner: TransactionSigner,
) =>
  getCloseAccountInstruction(
    {
      account: address(account.token_account),
      destination: owner.address,
      owner,
    },
    { programAddress: address(account.token_program) },
  );

interface Store {
  currentStep: number; // current step in the wizard
  initialAccounts: ParsedTokenAccount[]; // token accounts to close that we pass initially to the store
  simulatedAccounts: ParsedTokenAccount[]; // token accounts that were succesfully simulated so we can use them in the final transactions
  closedAccounts: ParsedTokenAccount[]; // token accounts that were actually closed
  error: string | null;
  goToStepTwo: (accountsToBeClosed: ParsedTokenAccount[]) => void;
  goToStepThree: (
    closedAccounts: ParsedTokenAccount[],
    error?: string | null,
  ) => void;
  closeDialog: () => void;
}

const CloseAccountsContext = createContext(null as unknown as StoreApi<Store>);

export const CloseAccountsProvider = ({
  children,
  initialAccounts,
  closeDialog,
}: {
  children: ReactNode;
  initialAccounts: ParsedTokenAccount[];
  closeDialog: () => void;
}) => {
  const [store] = useState(() => {
    const store = createStore<Store>()((set) => ({
      closeDialog,
      currentStep: 0,
      initialAccounts: initialAccounts,
      simulatedAccounts: [],
      closedAccounts: [],
      error: null,
      goToStepTwo: (accounts) =>
        set(() => ({ simulatedAccounts: accounts, currentStep: 1 })),
      goToStepThree: (accounts, error) =>
        set(() => ({
          currentStep: 2,
          error: error ?? null,
          closedAccounts: accounts,
        })),
    }));
    return store;
  });

  return (
    <CloseAccountsContext.Provider value={store}>
      {children}
    </CloseAccountsContext.Provider>
  );
};

export const useCloseAccountsStore = <T,>(selector: (state: Store) => T): T => {
  const store = useContext(CloseAccountsContext);
  if (!store) {
    throw new Error("Missing BearStoreProvider");
  }
  return useStore(store, selector);
};
