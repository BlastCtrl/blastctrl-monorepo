"use client";

import { notify } from "@/components";
import { compress } from "@/lib/solana";
import type { GetAirdropsId200 } from "@blastctrl/solace-sdk";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import clsx from "clsx";
import React from "react";
import { Box } from "../box";
import { formatDate, useFadeIn } from "../common";
import {
  useGetAirdropById,
  useRetryTransaction,
  useStartAirdrop,
} from "../state";

type TransactionStatus = GetAirdropsId200["transactions"][number]["status"];
type AirdropStatus = GetAirdropsId200["status"];

export default function AirdropDetails({
  params,
}: {
  params: { airdropId: string };
}) {
  const isVisible = useFadeIn();
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const { mutate, data: startData } = useStartAirdrop(params.airdropId);
  const hasStarted = !!startData;
  const [showOnlyPending, setShowOnlyPending] = React.useState(false);
  const { data, refetch } = useGetAirdropById(params.airdropId, hasStarted);

  const getAirdropStatusBadgeStyle = (status: AirdropStatus) => {
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

  const handleStartAirdrop = async () => {
    if (!publicKey) return;
    if (!data) return;
    if (!signAllTransactions) {
      notify({
        type: "error",
        description: "Sign all transactions not supported",
      });
      return;
    }

    const { value, context } =
      await connection.getLatestBlockhashAndContext("confirmed");
    const transactions = data.transactions.map((txBatch) => {
      const tx = new Transaction({ ...value, feePayer: publicKey }).add(
        ...txBatch.recipients.map((r) =>
          SystemProgram.transfer({
            lamports: r.lamports,
            fromPubkey: publicKey,
            toPubkey: new PublicKey(r.address),
          }),
        ),
      );
      tx.recentBlockhash = value.blockhash;
      tx.lastValidBlockHeight = context.slot;
      return tx;
    });

    const signedTransactions = await signAllTransactions(
      transactions.map((tx) => tx),
    );

    mutate(
      signedTransactions.map((tx, i) => ({
        batchId: data.transactions[i]!.id,
        minContextSlot: context.slot,
        txBase64: tx
          .serialize({ requireAllSignatures: true, verifySignatures: true })
          .toString("base64"),
        ...value,
      })),
    );
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
                  <span className="truncate text-right font-mono text-xs">
                    {data.id}
                  </span>
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
                    <span className="text-right">
                      {(data?.lamportsPerUser ?? 0) / LAMPORTS_PER_SOL} SOL
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="text-right font-medium">
                    {data.totalAmount / LAMPORTS_PER_SOL} SOL
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Recipients</span>
                  <span className="text-right">{data.recipientCount}</span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Created</span>
                  <span className="text-right">
                    {formatDate(data.createdAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Last Updated</span>
                  <span className="text-right">
                    {formatDate(data.updatedAt)}
                  </span>
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
                      className="h-2.5 animate-[width] rounded-full bg-indigo-600 duration-200 ease-in-out"
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
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowOnlyPending(!showOnlyPending)}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      showOnlyPending
                        ? "border border-indigo-200 bg-indigo-100 text-indigo-800"
                        : "border border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  >
                    {showOnlyPending ? "Show All" : "Show Pending Only"}
                  </button>
                  <span className="text-xs text-gray-500">
                    {data.transactions.length} batches
                  </span>
                </div>
              </div>

              {/* Batch list */}
              <div className="max-h-96 overflow-y-auto rounded border">
                <div className="divide-y">
                  {data.transactions.filter(
                    (batch) => !showOnlyPending || batch.status !== "confirmed",
                  ).length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p>
                        No {showOnlyPending ? "pending" : ""} batches to display
                      </p>
                    </div>
                  ) : (
                    data.transactions
                      .filter(
                        (batch) =>
                          !showOnlyPending || batch.status !== "confirmed",
                      )
                      .map((batch) => (
                        <Batch
                          key={batch.id}
                          index={batch.counter}
                          batch={batch}
                          airdropId={data.id}
                          refetchAirdrop={refetch}
                        />
                      ))
                  )}
                </div>
              </div>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}

function Batch({
  batch,
  index,
  airdropId,
  refetchAirdrop,
}: {
  batch: GetAirdropsId200["transactions"][number];
  airdropId: string;
  refetchAirdrop: () => Promise<unknown>;
  index: number;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { mutate, isPending, error } = useRetryTransaction(
    airdropId,
    batch.id.toString(),
  );
  const getStatusBadgeStyle = (status: TransactionStatus) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirming":
        return "bg-blue-100 text-blue-800";
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "expired":
        return "bg-rose-100 text-rose-800";
    }
  };

  const handleRetry = async () => {
    if (!publicKey || !signTransaction) {
      notify({
        type: "error",
        description: "Sign transaction feature not available",
      });
      return;
    }
    const { context, value } =
      await connection.getLatestBlockhashAndContext("confirmed");
    const transaction = new Transaction({ ...value, feePayer: publicKey }).add(
      ...batch.recipients.map((r) =>
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(r.address),
          lamports: r.lamports,
        }),
      ),
    );
    const signed = await signTransaction(transaction);

    mutate(
      {
        ...value,
        minContextSlot: context.slot,
        txBase64: signed
          .serialize({ requireAllSignatures: true, verifySignatures: true })
          .toString("base64"),
      },
      {
        onSuccess: async () => {
          await refetchAirdrop();
        },
      },
    );
  };

  return (
    <div key={batch.id} className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center">
          <span className="mr-2 font-mono text-xs">
            transaction {index + 1}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeStyle(batch.status)}`}
          >
            {batch.status}
          </span>
        </div>

        {batch.status === "expired" && (
          <Button
            onClick={() => handleRetry()}
            disabled={isPending}
            color="indigo"
            className="!px-3 text-xs !leading-4"
          >
            {isPending && <SpinnerIcon className="size-4" />}
            Retry
          </Button>
        )}
        {error && <div className="text-sm text-rose-500">{error.message}</div>}

        {/* Show spinner for processing batches */}
        {batch.status === "confirming" && (
          <div className="size-5 animate-spin rounded-full border-2 border-b-indigo-200 border-l-indigo-200 border-r-indigo-200 border-t-indigo-600"></div>
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
                className="mb-1 flex max-w-full justify-between gap-4"
              >
                <span className="break-all font-mono">{recipient.address}</span>
                <span className="whitespace-nowrap">
                  {recipient.lamports / LAMPORTS_PER_SOL} SOL
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
