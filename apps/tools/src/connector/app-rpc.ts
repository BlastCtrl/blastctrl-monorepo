"use client";

import { env } from "@/env/client";
import type {
  DasAsset,
  GetAssetParams,
  GetAssetsParams,
  SearchAssetsParams,
  SearchAssetsResult,
} from "@/state/queries/types";
import { useCluster, useConnectorClient } from "@solana/connector/react";
import {
  createDefaultRpcTransport,
  createJsonRpcApi,
  createRpc,
  createSolanaRpcApi,
  DEFAULT_RPC_CONFIG,
  type Rpc,
  type RpcApi,
  type SolanaRpcApi,
} from "@solana/kit";
import { useMemo } from "react";

/**
 * The Digital Asset Standard methods this app calls. Only these are declared;
 * add more here when a tool needs them. `getAssets` is the Metaplex name for
 * what Helius calls `getAssetBatch` (Triton accepts both).
 */
export type DasApi = {
  getAsset(params: GetAssetParams): DasAsset;
  getAssets(params: GetAssetsParams): (DasAsset | null)[];
  searchAssets(params: SearchAssetsParams): SearchAssetsResult;
};

export type AppRpcApi = SolanaRpcApi & DasApi;
export type AppRpc = Rpc<AppRpcApi>;

const DAS_METHODS = new Set<string>(["getAsset", "getAssets", "searchAssets"]);

/**
 * Kit's Solana API plus the DAS methods, served over one transport.
 *
 * The Solana methods keep Kit's own request and response transformers
 * (commitment defaults, bigint upcasting). DAS methods get a separate, plain
 * JSON-RPC API: they take a single named-params object and their numbers must
 * stay numbers, so Kit's transformers would be wrong for them. A proxy routes
 * each method name to the right API.
 */
export function createAppRpcApi(): RpcApi<AppRpcApi> {
  const solanaApi = createSolanaRpcApi<SolanaRpcApi>(DEFAULT_RPC_CONFIG);
  const dasApi = createJsonRpcApi<DasApi>({
    // `rpc.getAsset({ id })` arrives as params `[{ id }]`; DAS wants the object itself.
    requestTransformer: (request) => ({
      ...request,
      params: (request.params as unknown[])[0],
    }),
    responseTransformer: (response) => {
      const { error, result } = response as {
        error?: { code: number; message: string };
        result?: unknown;
      };
      if (error) {
        throw new Error(`DAS request failed (${error.code}): ${error.message}`);
      }
      return result;
    },
  });

  return new Proxy(solanaApi, {
    get(target, method, receiver) {
      if (typeof method === "string" && DAS_METHODS.has(method)) {
        return Reflect.get(dasApi, method);
      }
      return Reflect.get(target, method, receiver);
    },
  }) as RpcApi<AppRpcApi>;
}

const rpcCache = new Map<string, AppRpc>();

/** One RPC per endpoint URL, shared across hooks and the kit client. */
export function getAppRpc(url: string): AppRpc {
  let rpc = rpcCache.get(url);
  if (!rpc) {
    rpc = createRpc({
      api: createAppRpcApi(),
      transport: createDefaultRpcTransport({ url }),
    });
    rpcCache.set(url, rpc);
  }
  return rpc;
}

export type UseAppRpcReturn = {
  /** RPC for the connector's active cluster, with DAS methods. Null until a cluster is known. */
  rpc: AppRpc | null;
  /**
   * Whether DAS calls can be expected to work. Mainnet goes through Triton;
   * devnet only when a dedicated endpoint is configured; never on testnet.
   */
  dasAvailable: boolean;
  /** Cluster type, used to namespace cached asset data. */
  network: string;
};

/** Read-only access to the active cluster's RPC. No wallet needed. */
export function useAppRpc(): UseAppRpcReturn {
  const { type } = useCluster();
  const connectorClient = useConnectorClient();
  const url = connectorClient?.getRpcUrl() ?? null;

  return useMemo(
    () => ({
      rpc: url ? getAppRpc(url) : null,
      dasAvailable:
        type === "mainnet" ||
        (type === "devnet" && !!env.NEXT_PUBLIC_RPC_ENDPOINT_DEVNET),
      network: type ?? "mainnet",
    }),
    [url, type],
  );
}
