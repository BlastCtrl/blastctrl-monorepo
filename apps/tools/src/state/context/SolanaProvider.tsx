import { notify } from "@/components";
import { walletNetworkForEndpoint } from "@/lib/solana/endpoints";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import type { WalletError } from "@solana/wallet-adapter-base";
import {
  WalletAdapterNetwork,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignMessageError,
  WalletSignTransactionError,
} from "@solana/wallet-adapter-base";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  WalletConnectWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { AutoConnectProvider, useAutoConnect } from "./AutoConnectProvider";
import { clusterApiUrl } from "@solana/web3.js";

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
  const endpoint = useMemo(() => getEndpoint(network), [network]);

  const wallets = useMemo(() => {
    const walletNetwork = walletNetworkForEndpoint(endpoint);
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: walletNetwork }),
      new LedgerWalletAdapter(),
      new WalletConnectWalletAdapter({
        // WalletConnect has no testnet; it signs for devnet instead.
        network:
          walletNetwork === WalletAdapterNetwork.Mainnet
            ? WalletAdapterNetwork.Mainnet
            : WalletAdapterNetwork.Devnet,
        options: {
          projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
        },
      }),
    ];
  }, [endpoint]);

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

export function getEndpoint(
  endpoint: "mainnet-beta" | "testnet" | "devnet" | (string & {}),
): string {
  endpoint = endpoint.toLowerCase();
  switch (endpoint) {
    case "mainnet-beta":
      return process.env.NEXT_PUBLIC_RPC_ENDPOINT!;
    case "testnet":
      return clusterApiUrl("testnet");
    case "devnet":
      return (
        process.env.NEXT_PUBLIC_RPC_ENDPOINT_DEVNET || clusterApiUrl("devnet")
      );
    default:
      return endpoint;
  }
}
