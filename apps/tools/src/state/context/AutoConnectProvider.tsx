import type { FC, ReactNode } from "react";
import { createContext, useContext } from "react";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage";

export interface AutoConnectContextState {
  autoConnect: boolean;
  setAutoConnect: (autoConnect: boolean) => void;
}

export const AutoConnectContext = createContext<AutoConnectContextState>(
  {} as AutoConnectContextState,
);

export function useAutoConnect(): AutoConnectContextState {
  return useContext(AutoConnectContext);
}

export const AutoConnectProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [autoConnect, setAutoConnect] = useLocalStorageState(
    "autoConnect",
    true,
  );

  return (
    <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
      {children}
    </AutoConnectContext.Provider>
  );
};
