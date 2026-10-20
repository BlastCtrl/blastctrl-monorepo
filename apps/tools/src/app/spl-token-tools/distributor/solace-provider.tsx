"use client";

import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import build, { type SolaceSDK } from "@blastctrl/solace-sdk";
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
/** Proxied to the backend by `next.config.js`, so requests stay same-origin. */
const BASE_URL = "/blast-api";

type SolaceContextValue = {
  sdk: SolaceSDK;
  authToken: AuthToken | null;
  setAuthToken: React.Dispatch<React.SetStateAction<AuthToken | null>>;
};

const SolaceContext = React.createContext<SolaceContextValue | null>(null);

function useSolaceContext() {
  const context = React.useContext(SolaceContext);
  if (!context) {
    throw new Error("useSolace must be used within a SolaceProvider");
  }
  return context;
}

/** The SDK instance bound to the current sign-in token. */
export function useSolace(): SolaceSDK {
  return useSolaceContext().sdk;
}

/** The sign-in token (persisted in local storage) and its setter. */
export function useSolaceAuth() {
  const { authToken, setAuthToken } = useSolaceContext();
  return { authToken, setAuthToken };
}

export function SolaceProvider({ children }: { children: React.ReactNode }) {
  const { account } = useConnector();
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const [authToken, setAuthToken] = useLocalStorageState<AuthToken | null>(
    AUTH_TOKEN_KEY,
    null,
  );

  // The instance is bound to the token, so a new token means a new instance.
  const token = authToken?.token ?? null;
  const sdk = React.useMemo(
    () =>
      build(BASE_URL, token ? { authorization: `Bearer ${token}` } : undefined),
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
    () => ({ sdk, authToken, setAuthToken }),
    [sdk, authToken, setAuthToken],
  );

  return (
    <SolaceContext.Provider value={value}>{children}</SolaceContext.Provider>
  );
}
