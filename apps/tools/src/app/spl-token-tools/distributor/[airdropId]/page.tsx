"use client";

import React from "react";
import { Button } from "@blastctrl/ui";
import { Box } from "../box";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import clsx from "clsx";
import { useFadeIn, formatDate } from "../common";
import type { GetAirdropsIdResponseOK } from "@blastctrl/solace";
import { compress } from "@/lib/solana";
import { useGetAirdropById, useStartAirdrop } from "../state";

type TransactionStatus =
  GetAirdropsIdResponseOK["transactions"][number]["status"];
type AirdropStatus = GetAirdropsIdResponseOK["status"];

export default function AirdropDetails({
  params,
}: {
  params: { airdropId: string };
}) {
  const isVisible = useFadeIn();
  const { mutate, data: startData } = useStartAirdrop();
  const hasStarted = !!startData;
  const { data } = useGetAirdropById(params.airdropId, hasStarted);

  const getStatusBadgeStyle = (status: TransactionStatus) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "expired":
        return "bg-rose-100 text-rose-800";
    }
  };

  const getAirdropStatusBadgeStyle = (status: AirdropStatus): string => {
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

  // Calculate airdrop progress
  const calculateProgress = (): number => {
    if (!data) return 0;
    if (data.status === "completed") return 100;
    if (data.status === "created") return 0;

    const confirmedBatches = data.transactions.filter(
      (b) => b.status === "confirmed",
    ).length;
    return Math.round((confirmedBatches / data.transactions.length) * 100);
  };

  // Handlers
  const handleStartAirdrop = () => {
    if (!data) {
      return;
    }
    mutate({
      airdropId: data.id,
    });
  };

  const handleRetry = (batchId: string) => {
    alert(`Retrying batch ${batchId}`);
    // Implementation would go here
  };

  const progress = calculateProgress();

  return (
    <div
      className={clsx(
        "transition-all duration-300 ease-in-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      {/* Header with back button */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Airdrop Details</h1>

        <Button
          href="/spl-token-tools/distributor"
          color="dark/zinc"
          className="!px-4 text-sm"
        >
          ← Back to Airdrops
        </Button>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Meta information section */}
          <div className="md:col-span-1">
            <Box className="h-full">
              <h2 className="mb-3 text-base font-semibold">
                Airdrop Information
              </h2>

              <div className="space-y-2">
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Status</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${getAirdropStatusBadgeStyle(data.status)}`}
                  >
                    {data.status}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">ID</span>
                  <span className="font-mono text-xs">{data.id}</span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Type</span>
                  <span>
                    {data.type === "same" ? "Same amount" : "Different amounts"}
                  </span>
                </div>

                {data.type === "same" && (
                  <div className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-600">Amount per recipient</span>
                    <span>
                      {(data?.lamportsPerUser ?? 0) / LAMPORTS_PER_SOL} SOL
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="font-medium">
                    {data.totalAmount / LAMPORTS_PER_SOL} SOL
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Recipients</span>
                  <span>{data.recipientCount}</span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Created</span>
                  <span>{formatDate(data.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Last Updated</span>
                  <span>{formatDate(data.updatedAt)}</span>
                </div>
              </div>

              {/* Action button - only show if not started yet */}
              {data.status === "created" && (
                <div className="mt-4">
                  <Button
                    onClick={handleStartAirdrop}
                    color="indigo"
                    className="w-full"
                  >
                    Start Airdrop
                  </Button>
                </div>
              )}

              {/* Progress bar - only show if started */}
              {data.status !== "created" && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2.5 rounded-full bg-indigo-600"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </Box>
          </div>

          {/* Transaction batches section */}
          <div className="md:col-span-2">
            <Box className="h-full">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Transaction Batches</h2>
                <span className="text-xs text-gray-500">
                  {data.transactions.length} batches
                </span>
              </div>

              {/* Batch list */}
              <div className="max-h-96 overflow-y-auto rounded border">
                <div className="divide-y">
                  {data.transactions.map((batch, i) => (
                    <div key={batch.id} className="p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="mr-2 font-mono text-xs">
                            transaction {i + 1}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeStyle(batch.status)}`}
                          >
                            {batch.status}
                          </span>
                        </div>

                        {/* Show retry button for failed batches */}
                        {batch.status === "failed" && (
                          <Button
                            onClick={() => handleRetry(batch.id.toString())}
                            color="indigo"
                            className="!px-3 py-1 text-xs"
                          >
                            Retry
                          </Button>
                        )}

                        {/* Show spinner for processing batches */}
                        {batch.status === "pending" && (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-b-indigo-200 border-l-indigo-200 border-r-indigo-200 border-t-indigo-600"></div>
                        )}
                      </div>

                      <div className="mb-2 text-xs text-gray-500">
                        <div className="flex justify-between">
                          <span>Created: {formatDate(batch.createdAt)}</span>
                        </div>
                      </div>

                      {!!batch.signature && (
                        <div className="mt-1 text-xs">
                          <span className="text-gray-500">Signature: </span>
                          <a
                            href={`https://explorer.solana.com/tx/${batch.signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-indigo-600 hover:text-indigo-800"
                          >
                            {compress(batch.signature, 6)}
                          </a>
                        </div>
                      )}

                      {/* Collapsible recipients list */}
                      <div className="mt-2">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">
                            Show Recipients ({batch.recipients.length})
                          </summary>
                          <div className="mt-2 border-l-2 border-gray-200 pl-2">
                            {batch.recipients.map((recipient, i) => (
                              <div
                                key={i}
                                className="mb-1 flex justify-between"
                              >
                                <span className="font-mono">
                                  {recipient.walletAddress}
                                </span>
                                <span>
                                  {recipient.lamports / LAMPORTS_PER_SOL} SOL
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}
