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
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useSolace } from "./solace-provider";
import { useGetAirdrops } from "./state";
import { formatDate, SolaceError, useFadeIn } from "./common";
import { jwtDecode } from "jwt-decode";
import { notify } from "@/components/notification";

export default function Overview() {
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
      console.log(response.data);
      return;
    }

    setAuthToken(response.data);
  }, [publicKey, authToken?.refreshToken]);

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

  return <SolaceAirdropDashboard />;
}

type AirdropStatus = GetAirdropsId200["status"];

const SolaceAirdropDashboard = () => {
  const visible = useFadeIn();
  const [selectedAirdropId, setSelectedAirdropId] = useState<string | null>(
    null,
  );

  const { data: airdrops, isLoading, isError } = useGetAirdrops();

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
          <div className="rounded bg-red-50 p-3 text-center text-red-700">
            Failed to load airdrops. Please try again later.
          </div>
        )}

        {!isLoading && !isError && airdrops?.length === 0 && (
          <div className="py-6 text-center text-gray-500">
            <p>You haven't created any airdrops yet.</p>
          </div>
        )}

        {!isLoading && !isError && airdrops && airdrops.length > 0 && (
          <div className="max-h-[500px] overflow-hidden overflow-y-auto rounded border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {airdrops.map((airdrop) => (
                  <tr
                    key={airdrop.id}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedAirdropId === airdrop.id ? "bg-indigo-50" : ""}`}
                    onClick={() =>
                      setSelectedAirdropId(
                        selectedAirdropId === airdrop.id ? null : airdrop.id,
                      )
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
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
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              View Full Details →
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
