"use client";

import { useMemo } from "react";
import {
  createSolanaRpcSubscriptions,
  pipe,
  type TransactionSigner,
} from "@solana/kit";
import {
  createClient,
  extendClient,
  rpcGetMinimumBalance,
  rpcTransactionPlanner,
  rpcTransactionPlanSendingExecutor,
  rpcTransactionPlanSigningExecutor,
  type TransactionPlannerConfig,
} from "@solana/connector/kit";
import { signer } from "@solana/kit-plugin-signer";
import { useConnectorClient, useKitTransactionSigner } from "@solana/connector";
import { getAppRpc } from "./app-rpc";

/**
 * Same plugin set as `solanaRpc()` from `@solana/kit-plugin-rpc`, but over the
 * app's shared RPC so `client.rpc` also exposes the DAS methods.
 */
function createKitClient(
  walletSigner: TransactionSigner,
  rpcUrl: string,
  rpcSubscriptionsUrl: string,
  transactionConfig?: TransactionPlannerConfig,
) {
  const executorConfig = {
    estimateResourceLimits: transactionConfig?.estimateResourceLimits,
  };
  return pipe(
    createClient(),
    signer(walletSigner),
    (client) =>
      extendClient(client, {
        rpc: getAppRpc(rpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions(rpcSubscriptionsUrl),
      }),
    rpcGetMinimumBalance(),
    rpcTransactionPlanner(transactionConfig),
    rpcTransactionPlanSigningExecutor(executorConfig),
    rpcTransactionPlanSendingExecutor(executorConfig),
  );
}

export type KitClient = ReturnType<typeof createKitClient>;
/** The app's fully assembled kit client: wallet signer, RPC with DAS, planner and executors. */
export type AppClient = KitClient;

export interface UseKitClientReturn {
  /** Plugin client for the connected wallet and cluster (null when either is missing) */
  client: KitClient | null;
  /** Whether a client is available */
  ready: boolean;
}

export interface UseKitClientOptions {
  /**
   * Planner config passed through to the transaction planner. Set
   * `{ version: 1, ... }` to build v1 (SIMD-0296) transactions; omit for the
   * default (version 0).
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
      return { client: null, ready: false };
    }

    return {
      client: createKitClient(
        walletSigner,
        rpcUrl,
        rpcSubscriptionsUrl,
        transactionConfig,
      ),
      ready: true,
    };
  }, [rpcUrl, rpcSubscriptionsUrl, transactionConfig, walletSigner]);
}
