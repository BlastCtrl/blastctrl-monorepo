"use client";

import { useLocalStorageState } from "@/lib/hooks/use-local-storage";
import { useWallet } from "@solana/wallet-adapter-react";
import { Box } from "./box";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@blastctrl/ui";
import base58 from "bs58";
import build, { GetAirdropsResponseOK } from "@blastctrl/solace";
import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { SolaceError } from "./common";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const solace = build("/blast-api");

export default function Overview() {
  const { publicKey, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [authToken, setAuthToken] = useLocalStorageState<{
    token: string;
    expiresAt: number;
    refreshToken: string;
  } | null>("authToken", null);

  const refreshAccessToken = useCallback(async () => {
    if (!authToken?.refreshToken || !publicKey) return;
    const response = await solace.postAuthRefresh({
      address: publicKey?.toString(),
      refreshToken: authToken.refreshToken,
    });

    if ("error" in response) {
      console.log(response.error, response.message);
      return;
    }
    setAuthToken(response);
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

  const handleRequestAuth = async () => {
    if (!publicKey || !signMessage) {
      throw new Error("wallet cannot sign");
    }

    let challenge = await solace.getAuthChallenge({
      address: publicKey.toString(),
    });
    if ("error" in challenge) {
      throw new Error(challenge.message);
    }
    const msgUint8 = new TextEncoder().encode(challenge.message);
    const signature = await signMessage(msgUint8);

    const authResp = await solace.postAuthVerify({
      address: publicKey?.toString(),
      signature: base58.encode(signature),
    });

    if ("error" in authResp) {
      throw new Error(authResp.message);
    }

    setAuthToken({
      token: authResp.token,
      expiresAt: authResp.expiresAt,
      refreshToken: authResp.refreshToken,
    });
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

  return <SolaceAirdropDashboard authToken={authToken?.token!} />;
}

type AirdropStatus = GetAirdropsResponseOK[number]["status"];

const SolaceAirdropDashboard = ({ authToken }: { authToken: string }) => {
  const [visible, setVisible] = useState<boolean>(false);
  const [selectedAirdropId, setSelectedAirdropId] = useState<string | null>(
    null,
  );

  const {
    data: airdrops,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["airdrops", authToken],
    queryFn: async () => {
      const response = await solace.getAirdrops({
        authorization: `Bearer ${authToken}`,
      });
      if ("error" in response) {
        throw new SolaceError(response);
      }
      return response;
    },
  });

  // Get the selected airdrop details
  const selectedAirdrop =
    airdrops?.find((airdrop) => airdrop.id === selectedAirdropId) || null;

  useEffect(() => {
    // Small delay to ensure the animation plays after the component mounts
    const timer = setTimeout(() => {
      setVisible(true);
    }, 10);

    return () => clearTimeout(timer);
  }, []);

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Get status badge style
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
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <Box className="mb-4">
        <div className="flex justify-between gap-4 flex-wrap mb-3">
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
            <div className="w-8 h-8 border-4 border-t-indigo-600 border-r-indigo-200 border-b-indigo-200 border-l-indigo-200 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Loading your airdrops...</p>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 text-red-700 p-3 rounded text-center">
            Failed to load airdrops. Please try again later.
          </div>
        )}

        {!isLoading && !isError && airdrops?.length === 0 && (
          <div className="py-6 text-center text-gray-500">
            <p>You haven't created any airdrops yet.</p>
            <Link
              href="/airdrop/new"
              className="text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
            >
              Create your first airdrop
            </Link>
          </div>
        )}

        {!isLoading && !isError && airdrops && airdrops.length > 0 && (
          <div className="overflow-hidden border rounded max-h-[300px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recipients
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
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
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {formatDate(airdrop.createdAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">SOL</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {airdrop.recipientCount}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeStyle(airdrop.status)}`}
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-semibold">Airdrop Details</h2>
            <Link
              href={`/distributor/${selectedAirdrop.id}`}
              className="text-indigo-600 hover:text-indigo-800 text-sm"
            >
              View Full Details →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Recipients</h3>
              <span className="text-xs text-gray-500">
                Showing {Math.min(5, selectedAirdrop.recipients.length)} of{" "}
                {selectedAirdrop.recipientCount}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto border rounded">
              <table className="min-w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-1.5 text-left text-xs font-medium">
                      Address
                    </th>
                    <th className="p-1.5 text-right text-xs font-medium w-32">
                      Amount (SOL)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {selectedAirdrop.recipients
                    .slice(0, 5)
                    .map((recipient, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-1.5 truncate max-w-md font-mono">
                          {recipient.walletAddress}
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
                        className="p-1.5 text-gray-500 text-center text-xs"
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
