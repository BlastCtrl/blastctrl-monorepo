"use client";

import { useMemo } from "react";
import type { TransactionSigner } from "@solana/kit";
import {
  createClient,
  solanaRpc,
  type TransactionPlannerConfig,
} from "@solana/connector/kit";
import { signer } from "@solana/kit-plugin-signer";
import { useConnectorClient, useKitTransactionSigner } from "@solana/connector";

function createKitClient(
  walletSigner: TransactionSigner,
  rpcUrl: string,
  rpcSubscriptionsUrl: string,
  transactionConfig?: TransactionPlannerConfig,
) {
  return createClient()
    .use(signer(walletSigner))
    .use(solanaRpc({ rpcUrl, rpcSubscriptionsUrl, transactionConfig }));
}

export type KitClient = ReturnType<typeof createKitClient>;

export interface UseKitClientReturn {
  /** Plugin client for the connected wallet and cluster (null when either is missing) */
  client: KitClient | null;
  /** Whether a client is available */
  ready: boolean;
}

export interface UseKitClientOptions {
  /**
   * Planner config passed through to `solanaRpc`. Set `{ version: 1, ... }`
   * to build v1 (SIMD-0296) transactions; omit for the default (version 0).
   */
  transactionConfig?: TransactionPlannerConfig;
}

export function useKitClient(
  options?: UseKitClientOptions,
): UseKitClientReturn {
  const { signer: walletSigner } = useKitTransactionSigner();
  const connectorClient = useConnectorClient();
  const rpcUrl = connectorClient?.getRpcUrl();
  const rpcSubscriptionsUrl = rpcUrl?.replace(/^https:\/\//, "wss://") ?? null;

  const transactionConfig = options?.transactionConfig;

  return useMemo(() => {
    if (!walletSigner || !rpcUrl || !rpcSubscriptionsUrl) {
      return { client: null, ready: false, canSendTransactions: false };
    }

    return {
      client: createKitClient(
        walletSigner,
        rpcUrl,
        rpcSubscriptionsUrl,
        transactionConfig,
      ),
      ready: true,
      canSendTransactions: true,
    };
  }, [rpcUrl, rpcSubscriptionsUrl, transactionConfig, walletSigner]);
}
