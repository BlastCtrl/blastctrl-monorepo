"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { notify } from "@/components";
import { useMemo } from "react";
import {
  AppProvider as ConnectorProvider,
  getDefaultConfig,
  getDefaultMobileConfig,
} from "@solana/connector/react";
import { env } from "@/env/client";
import {
  ConnectorDialog,
  ConnectorDialogContext,
} from "@/connector/connector-dialog";

const getOrigin = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            notify({
              type: "error",
              title: "Query Error",
              description: error.message,
            });
          },
        }),
      }),
  );

  const connectorConfig = useMemo(() => {
    const origin = getOrigin();

    const clusters = [
      {
        id: "solana:mainnet" as const,
        label: "Mainnet",
        name: "mainnet-beta" as const,
        url: env.NEXT_PUBLIC_RPC_ENDPOINT,
      },
      {
        id: "solana:devnet" as const,
        label: "Devnet",
        name: "devnet" as const,
        url:
          env.NEXT_PUBLIC_RPC_ENDPOINT_DEVNET ??
          "https://api.devnet.solana.com",
      },
      {
        id: "solana:testnet" as const,
        label: "Testnet",
        name: "testnet" as const,
        url: "https://api.testnet.solana.com",
      },
    ];

    return getDefaultConfig({
      appName: "BlastCtrl Tools",
      appUrl: origin,
      autoConnect: true,
      enableMobile: true,
      clusters,
      wallets: {
        featured: ["solflare"],
      },
      // additionalWallets,
      walletConnect: true,
    });
  }, []);

  const mobile = useMemo(
    () =>
      getDefaultMobileConfig({
        appName: "BlastCtrl Tools",
        appUrl: getOrigin(),
      }),
    [],
  );
  const [open, setOpen] = useState(false);
  const dialogState = useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectorProvider connectorConfig={connectorConfig} mobile={mobile}>
        <ConnectorDialogContext value={dialogState}>
          <Toaster position="bottom-left" />
          <ReactQueryDevtools initialIsOpen={false} />
          <ConnectorDialog />
          {children}
        </ConnectorDialogContext>
      </ConnectorProvider>
    </QueryClientProvider>
  );
}
