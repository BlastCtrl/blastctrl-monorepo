import { notify } from "@/components";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { mergeClusterApiUrl } from "@/lib/solana/common";
import type { WalletError } from "@solana/wallet-adapter-base";
import {
  WalletConnectionError,
  WalletDisconnectedError,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
} from "@solana/wallet-adapter-base";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { AutoConnectProvider, useAutoConnect } from "./AutoConnectProvider";

const DynamicReactUiWalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (box) => box.WalletModalProvider,
    ),
  { ssr: false },
);

function WalletContextProvider({ children }: { children: ReactNode }) {
  const { autoConnect } = useAutoConnect();
  const { network } = useNetworkConfigurationStore();
  const endpoint = useMemo(() => mergeClusterApiUrl(network), [network]);

  const wallets = useMemo(() => [new LedgerWalletAdapter()], []);

  const onError = useCallback((error: WalletError) => {
    if (
      error instanceof WalletSendTransactionError ||
      error instanceof WalletSignTransactionError ||
      error instanceof WalletSignMessageError
    ) {
      // The caller should be handling this
      return;
    }

    if (
      error instanceof WalletNotConnectedError ||
      error instanceof WalletDisconnectedError ||
      error instanceof WalletConnectionError ||
      error instanceof WalletNotConnectedError
    ) {
      // Ignore
      notify({
        type: "info",
        title: "Wallet Error",
        description: "Connect your Solana wallet.",
      });
      return;
    }
    throw error;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        onError={onError}
        autoConnect={autoConnect}
      >
        <DynamicReactUiWalletModalProvider>
          {children}
        </DynamicReactUiWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  return (
    <AutoConnectProvider>
      <WalletContextProvider>{children}</WalletContextProvider>
    </AutoConnectProvider>
  );
}
