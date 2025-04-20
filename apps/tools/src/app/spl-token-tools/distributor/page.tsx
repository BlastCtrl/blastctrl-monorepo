"use client";

import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import { useWallet } from "@solana/wallet-adapter-react";
import { Box } from "./box";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@blastctrl/ui";
import base58 from "bs58";
import type {
  GetAirdrops200Item,
  GetAirdropsId200,
} from "@blastctrl/solace-sdk";
import { useState, useCallback, useEffect, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useSolace } from "./solace-provider";
import { useDeleteAirdrop, useGetAirdrops, useSetLabel } from "./state";
import { formatDate, useFadeIn } from "./common";
import { jwtDecode } from "jwt-decode";
import { notify } from "@/components/notification";
import { ArrowTurnDownRightIcon, TrashIcon } from "@heroicons/react/16/solid";
import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Input } from "@headlessui/react";
import { flushSync } from "react-dom";
import clsx from "clsx";

export default function Overview() {
  const { network } = useNetworkConfigurationStore();
  const { publicKey, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const solace = useSolace();
  const [authToken, setAuthToken] = useLocalStorageState<{
    token: string;
    expiresAt: number;
    refreshToken: string;
  } | null>("authToken", null);

  const refreshAccessToken = useCallback(async () => {
    if (!authToken?.refreshToken || !publicKey) return;
    const response = await solace.api.postAuthRefresh({
      address: publicKey?.toString(),
      refreshToken: authToken.refreshToken,
    });

    if (response.status !== 200) {
      console.error(
        "Auth refresh failed: %s",
        response?.data?.message ?? JSON.stringify(response.data),
      );
      return;
    }

    setAuthToken(response.data);
  }, [publicKey, authToken?.refreshToken]);

  const clearAuthToken = useCallback(() => {
    setAuthToken(null);
  }, []);

  useEffect(() => {
    if (authToken?.expiresAt) {
      // Set timeout to refresh 1 minute before token expires.
      const refreshInMs = Math.max(
        authToken?.expiresAt * 1000 - Date.now() - 60 * 1000,
        0,
      );
      const timeoutId = window.setTimeout(() => {
        refreshAccessToken();
      }, refreshInMs);
      return () => clearTimeout(timeoutId);
    }
  }, [authToken?.expiresAt, refreshAccessToken]);

  useEffect(() => {
    if (publicKey === null) return;
    if (authToken === null) return;
    if (authToken) {
      const decoded = jwtDecode(authToken.token);
      if (publicKey.toString() !== decoded.sub) {
        // we signed in with a different pubkey, wipe the auth token
        setAuthToken(null);
      }
    }
  }, [publicKey]);

  const handleRequestAuth = async () => {
    try {
      if (!publicKey || !signMessage) {
        throw new Error("wallet cannot sign");
      }

      let challenge = await solace.api.getAuthChallenge({
        address: publicKey.toString(),
      });
      if (challenge.status !== 200) {
        throw new Error("Auth challenge error", { cause: challenge.data });
      }
      const msgUint8 = new TextEncoder().encode(challenge.data.message);
      const signature = await signMessage(msgUint8);

      const authResp = await solace.api.postAuthVerify({
        address: publicKey?.toString(),
        signature: base58.encode(signature),
      });

      if (authResp.status !== 200) {
        throw new Error(authResp.data.message);
      }

      setAuthToken(authResp.data);
    } catch (error) {
      console.log(error);
      const [title, message] =
        error instanceof Error
          ? [error.name, error.message]
          : [undefined, "Unknown error happened, check console"];
      notify({ type: "error", title, description: message });
    }
  };

  if (network === "devnet" || network === "testnet") {
    return (
      <Box className="flex justify-center text-sm/6">
        This tool is currently only available on mainnet. Switch your network
        with the menu on the top right.
      </Box>
    );
  }

  if (!publicKey) {
    return (
      <Box className="flex justify-center">
        <Button
          onClick={() => setVisible(true)}
          color="indigo"
          className="w-full max-w-fit !px-6"
        >
          Please connect your wallet and sign in to use this tool
        </Button>
      </Box>
    );
  }

  if (publicKey && !authToken) {
    return (
      <Box className="flex justify-center">
        <Button
          onClick={async () => {
            await handleRequestAuth();
          }}
          color="indigo"
          className="w-full max-w-fit !px-6"
        >
          Click here to sign in
        </Button>
      </Box>
    );
  }

  return <SolaceAirdropDashboard clearAuthToken={clearAuthToken} />;
}

type AirdropStatus = GetAirdropsId200["status"];

const SolaceAirdropDashboard = ({
  clearAuthToken,
}: {
  clearAuthToken: () => void;
}) => {
  const visible = useFadeIn();
  const [selectedAirdropId, setSelectedAirdropId] = useState<string | null>(
    null,
  );

  const { disconnect } = useWallet();
  const { data: airdrops, isLoading, isError, error } = useGetAirdrops();
  const { mutate, isPending } = useDeleteAirdrop();

  // Get the selected airdrop details
  const selectedAirdrop =
    airdrops?.find((airdrop) => airdrop.id === selectedAirdropId) || null;

  const getStatusBadgeStyle = (status: AirdropStatus): string => {
    switch (status) {
      case "created":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
    }
  };

  return (
    <div
      className={`transform transition-all duration-300 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <Box className="mb-4">
        <div className="mb-3 flex flex-wrap justify-between gap-4">
          <h2 className="text-base font-semibold">Your Airdrops</h2>
          <Button
            color="indigo"
            href="/spl-token-tools/distributor/new"
            className="!px-4"
          >
            Create New Airdrop
          </Button>
        </div>

        {isLoading && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-b-indigo-200 border-l-indigo-200 border-r-indigo-200 border-t-indigo-600"></div>
            <p className="text-sm text-gray-500">Loading your airdrops...</p>
          </div>
        )}

        {isError && (
          <div className="space-y-2 rounded bg-red-50 p-3 text-center text-red-700">
            Failed to load airdrops.
            {error.error === "FST_AUTHENTICATION_ERROR" && (
              <>
                <div>Authentication error, sign out and try again.</div>
                <Button
                  className="block"
                  onClick={() => {
                    clearAuthToken();
                    void disconnect();
                  }}
                >
                  Sign out
                </Button>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && airdrops?.length === 0 && (
          <div className="py-6 text-center text-gray-500">
            <p>You haven't created any airdrops yet.</p>
          </div>
        )}

        {!isLoading && !isError && airdrops && airdrops.length > 0 && (
          <div className="rounded border max-sm:overflow-x-auto sm:max-h-[500px] sm:overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="hidden px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sm:table-cell">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Token
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Recipients
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="relative w-0">
                    {/* <span className="sr-only">Action</span> */}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 bg-white">
                {airdrops.map((airdrop) => (
                  <tr
                    key={airdrop.id}
                    className={`cursor-default hover:bg-gray-50 ${selectedAirdropId === airdrop.id ? "bg-indigo-50" : ""}`}
                    onClick={() =>
                      setSelectedAirdropId(
                        selectedAirdropId === airdrop.id ? null : airdrop.id,
                      )
                    }
                  >
                    <td className="max-w-[140px] whitespace-nowrap px-3 py-2 text-sm sm:max-w-none">
                      <AirdropName airdrop={airdrop} />
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-sm sm:table-cell">
                      {formatDate(airdrop.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">SOL</td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      {airdrop.recipientCount}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-5 ${getStatusBadgeStyle(airdrop.status)}`}
                      >
                        {airdrop.status}
                      </span>
                    </td>
                    <td className="w-0 whitespace-nowrap py-2 pr-2">
                      <div className="relative flex items-center justify-center">
                        {airdrop.status === "created" && (
                          <button
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  "Are you sure you want to delete this airdrop?",
                                )
                              ) {
                                mutate({ id: airdrop.id });
                              }
                            }}
                            className="group rounded-md p-2 hover:bg-gray-200"
                          >
                            <span className="sr-only">Delete</span>
                            <TrashIcon className="size-4 text-gray-400 group-hover:text-gray-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>

      {/* Selected Airdrop Details */}
      {selectedAirdrop && (
        <Box className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Airdrop Details</h2>
            <Link
              href={`/spl-token-tools/distributor/${selectedAirdrop.id}`}
              className="group relative isolate overflow-visible text-sm text-indigo-600 hover:text-indigo-800"
            >
              <div className="absolute -inset-x-2 -inset-y-1 z-[-1] hidden rounded-md bg-indigo-50 group-hover:block" />
              View Full Details{" "}
              <ArrowTurnDownRightIcon
                aria-hidden="true"
                className="inline-block size-3.5"
              />
            </Link>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="space-y-2">
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">ID</span>
                  <span className="font-mono">{selectedAirdrop.id}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">Created</span>
                  <span>{formatDate(selectedAirdrop.createdAt)}</span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">Last Updated</span>
                  <span>{formatDate(selectedAirdrop.updatedAt)}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="space-y-2">
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="font-medium">
                    {selectedAirdrop.totalAmount / LAMPORTS_PER_SOL} SOL
                  </span>
                </div>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">Recipients</span>
                  <span>{selectedAirdrop.recipientCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recipients Table */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Recipients</h3>
              <span className="text-xs text-gray-500">
                Showing {Math.min(5, selectedAirdrop.recipients.length)} of{" "}
                {selectedAirdrop.recipientCount}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded border">
              <table className="min-w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-1.5 text-left text-xs font-medium">
                      Address
                    </th>
                    <th className="w-32 p-1.5 text-right text-xs font-medium">
                      Amount (SOL)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {selectedAirdrop.recipients
                    .slice(0, 5)
                    .map((recipient, index) => (
                      <tr key={index} className="border-t">
                        <td className="max-w-md truncate p-1.5 font-mono">
                          {recipient.address}
                        </td>
                        <td className="p-1.5 text-right">
                          {recipient.lamports / LAMPORTS_PER_SOL}
                        </td>
                      </tr>
                    ))}
                  {selectedAirdrop.recipients.length > 5 && (
                    <tr className="border-t">
                      <td
                        colSpan={2}
                        className="p-1.5 text-center text-xs text-gray-500"
                      >
                        ... and {selectedAirdrop.recipientCount - 5} more
                        recipients
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Box>
      )}
    </div>
  );
};

function AirdropName({ airdrop }: { airdrop: GetAirdrops200Item }) {
  const [state, setState] = useState<"edit" | "view">("view");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { mutate } = useSetLabel(airdrop.id);

  useEffect(() => {
    // fucking typescript
    function handleEscapePress(event: globalThis.KeyboardEvent) {
      if (event.code === "Escape") {
        setState("view");
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node) &&
        state === "edit"
      ) {
        setState("view");
      }
    }

    document.addEventListener("keydown", handleEscapePress);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapePress);
    };
  }, [state]);

  return (
    <>
      <div className="truncate px-2 py-0.5 text-left text-xs/4 font-medium text-zinc-700 sm:hidden">
        {airdrop.label || airdrop.id}
      </div>
      <div
        ref={wrapperRef}
        className={clsx(
          "hidden w-full max-w-44 overflow-hidden rounded bg-zinc-50 px-2 py-0.5 ring-1 ring-zinc-300 sm:block",
          "focus-within:ring-2 focus-within:ring-indigo-500",
        )}
      >
        {state === "view" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              flushSync(() => {
                setState("edit");
              });
              inputRef?.current?.select();
            }}
            className="w-full cursor-text truncate text-left"
          >
            <span className="select-none font-mono text-xs/4 font-medium text-zinc-700">
              {airdrop.label || airdrop.id}
            </span>
          </button>
        ) : (
          <form
            onClick={(e) => {
              e.stopPropagation();
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (inputRef.current) {
                mutate(inputRef.current?.value.trim(), {
                  onSettled: () => {
                    setState("view");
                  },
                });
              }
            }}
          >
            <Input
              ref={inputRef}
              name="airdrop-label"
              defaultValue={airdrop.label || airdrop.id}
              maxLength={30}
              className={clsx(
                "w-full py-px font-mono text-xs/4 font-medium text-zinc-700",
                "bg-transparent focus:outline-none",
              )}
            />
          </form>
        )}
      </div>
    </>
  );
}
