"use client";

import { CommandPalette } from "@/components/layout/command-palette";
import { SolanaProvider } from "@/state/context/SolanaProvider";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { navigation } from "./_links";
import { notify } from "@/components";

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

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <Toaster position="bottom-left" />
        <ReactQueryDevtools initialIsOpen={false} />
        <CommandPalette navigation={navigation}>{children}</CommandPalette>
      </SolanaProvider>
    </QueryClientProvider>
  );
}
