"use client";

import { notify } from "@/components/notification";
import { useConnectorDialog } from "@/connector/connector-dialog";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient } from "@/connector/use-kit-client";
import { compress, lamportsToSol } from "@/lib/solana/common";
import {
  useCreateStakeTransactionActions,
  useCreateStakeTransactionState,
  useCreateStakeTransactionStore,
} from "@/state/stake-tx-store";
import useQueryContext from "@/state/use-query-context";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { useRef, useState } from "react";
import {
  EXAMPLE_CSV,
  MAX_ROWS,
  MIN_STAKE_LAMPORTS,
  parseStakeCsv,
  type ParsedData,
} from "./csv-rows";
import {
  BATCH_SIZE,
  sendStakeRow,
  sendStakeRowsInBatches,
  STAKE_ACCOUNT_SIZE,
  supportsBatchSigning,
  type RowUpdate,
} from "./stake-batch";

export function StakeCSVForm() {
  const { client } = useKitClient();
  const { setOpen } = useConnectorDialog();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedProcessing, setHasStartedProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fmtUrlWithCluster } = useQueryContext();

  const txState = useCreateStakeTransactionState();
  const txActions = useCreateStakeTransactionActions();

  const downloadExample = () => {
    const blob = new Blob([EXAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stake-accounts-example.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsLoading(true);
    setParsedData(null);
    setParsedData(await parseStakeCsv(selectedFile));
    setIsLoading(false);
  };

  const clearFile = () => {
    setFile(null);
    setParsedData(null);
    setHasStartedProcessing(false);
    txActions.resetTransactions();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const applyUpdate = (id: string, rowNumber: number, update: RowUpdate) => {
    switch (update.status) {
      case "processing":
        txActions.updateTransactionStatus(id, "processing");
        break;
      case "confirmed":
        txActions.updateTransactionStatus(id, "confirmed", update.signature);
        break;
      case "failed":
        txActions.updateTransactionStatus(
          id,
          "failed",
          undefined,
          update.error,
        );
        notify({
          type: "error",
          title: `Failed to create stake account ${rowNumber}`,
          description: update.error,
        });
        break;
    }
  };

  const processTransactions = async () => {
    if (!parsedData || !client) return;

    const timestamp = Date.now();
    const transactionData = parsedData.rows.map((row, index) => ({
      index: index + 1,
      amount: Number(row.stake_amount),
      id: `${index + 1}-${timestamp}`,
    }));
    txActions.initializeTransactions(transactionData);
    setHasStartedProcessing(true);

    try {
      const rentReserve = await client.getMinimumBalance(STAKE_ACCOUNT_SIZE);
      const rows = parsedData.rows.map((row, i) => ({
        id: transactionData[i]!.id,
        row,
      }));
      await sendStakeRowsInBatches(client, rows, rentReserve, (id, update) =>
        applyUpdate(id, rows.findIndex((r) => r.id === id) + 1, update),
      );

      const { transactions } = useCreateStakeTransactionStore.getState().state;
      const successCount = transactions.filter(
        (tx) => tx.status === "confirmed",
      ).length;
      const failedCount = transactions.filter(
        (tx) => tx.status === "failed",
      ).length;

      notify({
        type: failedCount === 0 ? "success" : "info",
        title: "Processing completed",
        description:
          failedCount === 0
            ? `Successfully created all ${successCount} stake accounts`
            : `Created ${successCount} stake accounts, ${failedCount} failed`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Processing failed",
        description: transactionErrorMessage(error),
      });
    } finally {
      txActions.setProcessing(false);
    }
  };

  const retryTransaction = async (transactionId: string) => {
    if (!parsedData || !client) return;

    const transaction = useCreateStakeTransactionStore
      .getState()
      .state.transactions.find((tx) => tx.id === transactionId);
    const row = transaction && parsedData.rows[transaction.index - 1];
    if (!transaction || !row) {
      console.error("Transaction not found for retry:", transactionId);
      return;
    }

    applyUpdate(transactionId, transaction.index, { status: "processing" });
    try {
      const rentReserve = await client.getMinimumBalance(STAKE_ACCOUNT_SIZE);
      const signature = await sendStakeRow(client, row, rentReserve);
      applyUpdate(transactionId, transaction.index, {
        status: "confirmed",
        signature,
      });
      notify({
        type: "success",
        title: "Retry successful",
        description: `Stake account ${transaction.index} created successfully`,
      });
    } catch (error) {
      applyUpdate(transactionId, transaction.index, {
        status: "failed",
        error: transactionErrorMessage(error),
      });
    }
  };

  const batchSigning = !!client && supportsBatchSigning(client);

  return (
    <div className="mt-6 space-y-6">
      {/* Description */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="text-lg font-medium text-blue-900">CSV Input Mode</h3>
        <p className="mt-2 text-sm text-blue-700">
          Upload a CSV file to create multiple stake accounts at once. This mode
          allows you to specify different parameters for each stake account
          including amounts, authorities, delegation targets, and lockup
          settings. Maximum {MAX_ROWS} rows allowed. Each stake account is one
          transaction.
        </p>
        {batchSigning && (
          <p className="mt-2 text-sm font-medium text-blue-600">
            Your wallet supports batch signing: transactions are approved in
            batches of {BATCH_SIZE}.
          </p>
        )}
      </div>

      {/* Example Download */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div>
          <h4 className="font-medium text-gray-900">Need an example?</h4>
          <p className="text-sm text-gray-600">
            Download a sample CSV file to see the correct format.
          </p>
        </div>
        <Button onClick={downloadExample} outline>
          Download Example
        </Button>
      </div>

      {/* CSV Headers Documentation */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h4 className="mb-3 font-medium text-gray-900">
          CSV Headers Reference
        </h4>
        <div className="space-y-3 text-sm">
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">stake_amount</div>
            <div className="flex-1">
              <span className="font-medium">Required.</span> Amount in lamports
              to delegate, at least {lamportsToSol(MIN_STAKE_LAMPORTS)} SOL. The
              rent-exempt reserve is added on top of it.
            </div>
          </div>
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">
              withdraw_authority
            </div>
            <div className="flex-1">
              Withdraw authority public key. If empty, defaults to connected
              wallet.
            </div>
          </div>
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">stake_authority</div>
            <div className="flex-1">
              Stake authority public key. If empty, defaults to connected
              wallet.
            </div>
          </div>
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">validator</div>
            <div className="flex-1">
              Vote address of the validator to delegate to. If empty, stake
              account is only created, not delegated.
            </div>
          </div>
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">unlock_date</div>
            <div className="flex-1">
              Lockup unlock date in RFC3339 format (e.g., 2024-12-31T23:59:59Z).
            </div>
          </div>
          <div className="flex">
            <div className="w-40 font-mono text-blue-600">lockup_custodian</div>
            <div className="flex-1">
              Lockup custodian address. If empty, defaults to connected wallet.
            </div>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-6">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-4">
            <label htmlFor="csv-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900">
                {file ? file.name : "Upload CSV file"}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                CSV files only
              </span>
            </label>
            <input
              ref={fileInputRef}
              id="csv-upload"
              name="csv-upload"
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>
          {file && (
            <div className="mt-4">
              <Button onClick={clearFile} outline>
                Clear File
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center">
          <div className="inline-flex items-center">
            <SpinnerIcon className="mr-3 -ml-1 h-5 w-5 text-blue-600" />
            Parsing CSV file...
          </div>
        </div>
      )}

      {/* Validation Results */}
      {parsedData && (
        <div className="space-y-4">
          {parsedData.errors.length > 0 ? (
            <div className="rounded-lg bg-red-50 p-4">
              <h4 className="font-medium text-red-800">Validation Errors</h4>
              <div className="mt-2 space-y-1">
                {parsedData.errors.map((error, index) => (
                  <p key={index} className="text-sm text-red-700">
                    Row {error.row}, Field &quot;{error.field}&quot;:{" "}
                    {error.message}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-sm text-red-600">
                Please fix these errors before proceeding.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 p-4">
                <h4 className="font-medium text-green-800">
                  CSV Validated Successfully
                </h4>
                <div className="mt-2 space-y-1 text-sm text-green-700">
                  <p>
                    ✓ {parsedData.rows.length} stake accounts will be created
                  </p>
                  <p>
                    ✓ Total SOL to delegate:{" "}
                    {parsedData.totalSol.toLocaleString()} SOL
                  </p>
                  <p className="text-xs text-green-600">
                    Note: Additional SOL is required for the rent-exempt reserve
                    of each account and for transaction fees.
                  </p>
                </div>
              </div>

              {/* Processing Status */}
              {txState.isProcessing && (
                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="flex items-center">
                    <SpinnerIcon className="mr-2 h-5 w-5 text-blue-600" />
                    <h4 className="font-medium text-blue-800">
                      Processing Transactions
                    </h4>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-blue-700">
                      Progress: {txState.completedTransactions} of{" "}
                      {txState.totalTransactions} transactions completed
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-blue-200">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                        style={{
                          width: `${(txState.completedTransactions / txState.totalTransactions) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-blue-600">
                    {batchSigning
                      ? `Please approve each batch of up to ${BATCH_SIZE} transactions in your wallet when prompted.`
                      : "Please approve each transaction in your wallet when prompted."}
                  </p>
                </div>
              )}

              {/* Proceed Button */}
              {!txState.isProcessing && !hasStartedProcessing && (
                <div className="flex justify-center">
                  {client ? (
                    <Button onClick={processTransactions} className="px-8 py-2">
                      Create {parsedData.rows.length} Stake Account
                      {parsedData.rows.length > 1 ? "s" : ""}
                    </Button>
                  ) : (
                    <Button onClick={() => setOpen(true)} className="px-8 py-2">
                      Connect Wallet to Continue
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Persistent Transaction Tracking */}
      {txState.transactions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-4 font-medium text-gray-900">
            Transaction Status ({txState.completedTransactions} of{" "}
            {txState.totalTransactions} completed)
          </h4>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {txState.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-md bg-white p-3 text-sm"
              >
                <div className="flex items-center space-x-4">
                  <span className="font-mono text-gray-500">#{tx.index}</span>
                  <span className="text-gray-900">
                    {lamportsToSol(tx.amount).toLocaleString()} SOL
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {tx.status === "pending" && (
                    <div className="flex items-center space-x-2">
                      <div className="size-3 rounded-full bg-yellow-500" />
                      <span className="text-yellow-700">Pending</span>
                    </div>
                  )}
                  {tx.status === "processing" && (
                    <div className="flex items-center space-x-2">
                      <div className="size-3 animate-spin rounded-full border-2 border-t-blue-600 border-r-blue-200 border-b-blue-200 border-l-blue-200"></div>
                      <span className="text-blue-700">Processing</span>
                    </div>
                  )}
                  {tx.status === "confirmed" && tx.signature && (
                    <div className="flex items-center space-x-2">
                      <div className="size-3 rounded-full bg-green-500" />
                      <a
                        href={fmtUrlWithCluster(
                          `https://explorer.solana.com/tx/${tx.signature}`,
                        )}
                        target="_blank"
                        className="font-medium whitespace-pre text-green-700 visited:text-green-900 hover:underline"
                      >
                        {compress(tx.signature, 4)}{" "}
                        <ArrowTopRightOnSquareIcon className="inline-block size-4 -translate-y-px" />
                      </a>
                    </div>
                  )}
                  {tx.status === "failed" && (
                    <div className="flex items-center space-x-2">
                      <div className="size-3 rounded-full bg-red-500" />
                      <span className="text-red-700">Failed</span>
                      <Button
                        onClick={() => retryTransaction(tx.id)}
                        disabled={txState.isProcessing}
                        className="px-2 py-1 text-xs"
                        outline
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
