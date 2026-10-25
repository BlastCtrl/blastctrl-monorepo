"use client";

import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import { useConnector } from "@solana/connector/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import React from "react";

export type AuthToken = {
  token: string;
  expiresAt: number;
  refreshToken: string;
};

const AUTH_TOKEN_KEY = "authToken";

type SolaceAuthContextValue = {
  authToken: AuthToken | null;
  setAuthToken: React.Dispatch<React.SetStateAction<AuthToken | null>>;
  /** Spread into the options of any SDK call that needs the bearer token. */
  requestInit: RequestInit;
};

const SolaceAuthContext = React.createContext<SolaceAuthContextValue | null>(
  null,
);

/**
 * The sign-in token (persisted in local storage), its setter, and the request
 * options that carry it to the Blast API.
 */
export function useSolaceAuth(): SolaceAuthContextValue {
  const context = React.useContext(SolaceAuthContext);
  if (!context) {
    throw new Error("useSolaceAuth must be used within a SolaceProvider");
  }
  return context;
}

export function SolaceProvider({ children }: { children: React.ReactNode }) {
  const { account } = useConnector();
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const [authToken, setAuthToken] = useLocalStorageState<AuthToken | null>(
    AUTH_TOKEN_KEY,
    null,
  );

  const token = authToken?.token ?? null;
  const requestInit = React.useMemo<RequestInit>(
    () => (token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    [token],
  );

  // Another tab signed in or out: adopt its token. Our own writes dispatch a
  // synthetic event without a storage area; those are skipped.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== AUTH_TOKEN_KEY ||
        event.storageArea !== window.localStorage
      ) {
        return;
      }
      try {
        setAuthToken(
          event.newValue ? (JSON.parse(event.newValue) as AuthToken) : null,
        );
      } catch {
        setAuthToken(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setAuthToken]);

  // Disconnecting the wallet while signed in drops the cached airdrops and
  // returns to the start. Only a real transition counts: the account is also
  // null while the connector is still reconnecting on page load.
  const previousAccount = React.useRef(account);
  React.useEffect(() => {
    const disconnected = previousAccount.current !== null && account === null;
    previousAccount.current = account;
    if (disconnected && authToken) {
      queryClient.removeQueries({ queryKey: ["airdrops"] });
      push("/spl-token-tools/distributor");
    }
  }, [account, authToken, queryClient, push]);

  const value = React.useMemo(
    () => ({ authToken, setAuthToken, requestInit }),
    [authToken, setAuthToken, requestInit],
  );

  return (
    <SolaceAuthContext.Provider value={value}>
      {children}
    </SolaceAuthContext.Provider>
  );
}
