"use client";

import { InfoTooltip } from "@/components/info-tooltip";
import { notify } from "@/components/notification";
import { isPublicKey, compress } from "@/lib/solana/common";
import { getSetLockupInstruction } from "@/lib/solana/stake";
import { retryWithBackoff } from "@/lib/utils";
import {
  useCreateStakeTransactionStore,
  useCreateStakeTransactionActions,
  useCreateStakeTransactionState,
} from "@/state/stake-tx-store";
import useQueryContext from "@/state/use-query-context";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Blockhash,
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeAuthorizationLayout,
  StakeProgram,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import Papa from "papaparse";
import { useState, useRef } from "react";

// 2h:30min

interface CSVRow {
  stake_amount: string;
  withdraw_authority?: string;
  stake_authority?: string;
  validator?: string;
  unlock_date?: string;
  lockup_custodian?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ParsedData {
  rows: CSVRow[];
  totalSol: number;
  errors: ValidationError[];
}

const EXAMPLE_CSV = `stake_amount,withdraw_authority,stake_authority,validator,unlock_date,lockup_custodian
1000000000,,,GREEDkpTvpKzcGvBu9qd36yk6BfjTWPShB67gLWuixMv,,
500000000,9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM,,,2024-12-31T23:59:59Z,
2000000000,,,,2025-01-15T12:00:00Z,5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1`;

export function StakeCSVForm() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const validateRow = (row: CSVRow, index: number): ValidationError[] => {
    const errors: ValidationError[] = [];

    // Validate stake_amount
    if (!row.stake_amount) {
      errors.push({
        row: index + 1,
        field: "stake_amount",
        message: "Stake amount is required",
      });
    } else {
      const amount = parseInt(row.stake_amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push({
          row: index + 1,
          field: "stake_amount",
          message: "Stake amount must be a positive number in lamports",
        });
      }
    }

    // Validate withdraw_authority if provided
    if (row.withdraw_authority && !isPublicKey(row.withdraw_authority)) {
      errors.push({
        row: index + 1,
        field: "withdraw_authority",
        message: "Invalid public key format",
      });
    }

    // Validate stake_authority if provided
    if (row.stake_authority && !isPublicKey(row.stake_authority)) {
      errors.push({
        row: index + 1,
        field: "stake_authority",
        message: "Invalid public key format",
      });
    }

    // Validate validator if provided
    if (row.validator && !isPublicKey(row.validator)) {
      errors.push({
        row: index + 1,
        field: "validator",
        message: "Invalid validator vote address format",
      });
    }

    // Validate unlock_date if provided
    if (row.unlock_date) {
      try {
        const date = new Date(row.unlock_date);
        if (isNaN(date.getTime())) {
          throw new Error("Invalid date");
        }
        // Check if it's in the future
        if (date <= new Date()) {
          errors.push({
            row: index + 1,
            field: "unlock_date",
            message: "Unlock date must be in the future",
          });
        }
      } catch (e) {
        errors.push({
          row: index + 1,
          field: "unlock_date",
          message:
            "Invalid date format (use RFC3339 format, e.g., 2024-12-31T23:59:59Z)",
        });
      }
    }

    // Validate lockup_custodian if provided
    if (row.lockup_custodian && !isPublicKey(row.lockup_custodian)) {
      errors.push({
        row: index + 1,
        field: "lockup_custodian",
        message: "Invalid lockup custodian public key format",
      });
    }

    return errors;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    setIsLoading(true);
    setParsedData(null);

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: ValidationError[] = [];
        let totalLamports = 0;

        // Check row limit
        if (results.data.length > 50) {
          errors.push({
            row: 0,
            field: "file",
            message: `Too many rows: ${results.data.length}. Maximum 50 rows allowed (excluding header).`,
          });
        }

        // Validate each row
        results.data.forEach((row, index) => {
          const rowErrors = validateRow(row, index);
          errors.push(...rowErrors);

          // Add to total if amount is valid
          const amount = parseInt(row.stake_amount);
          if (!isNaN(amount) && amount > 0) {
            totalLamports += amount;
          }
        });

        setParsedData({
          rows: results.data,
          totalSol: totalLamports / LAMPORTS_PER_SOL,
          errors,
        });
        setIsLoading(false);
      },
      error: (error) => {
        setParsedData({
          rows: [],
          totalSol: 0,
          errors: [
            {
              row: 0,
              field: "file",
              message: `Failed to parse CSV: ${error.message}`,
            },
          ],
        });
        setIsLoading(false);
      },
    });
  };

  const clearFile = () => {
    setFile(null);
    setParsedData(null);
    txActions.resetTransactions();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processTransactions = async () => {
    if (!parsedData || !sendTransaction || !publicKey) return;

    // Generate transaction IDs and data
    const timestamp = Date.now();
    const transactionData = parsedData.rows.map((row, index) => ({
      index: index + 1,
      amount: parseInt(row.stake_amount),
      id: `${index + 1}-${timestamp}`,
    }));
    txActions.initializeTransactions(transactionData);

    // Store the transaction IDs for consistent reference
    const transactionIds = transactionData.map((tx) => tx.id);

    try {
      for (let i = 0; i < parsedData.rows.length; i++) {
        const row = parsedData.rows[i]!;
        const txId = transactionIds[i]!;

        try {
          // Update status to processing
          txActions.updateTransactionStatus(txId, "processing");

          const { context, value } = await retryWithBackoff(() =>
            connection.getLatestBlockhashAndContext("confirmed"),
          );

          const stakeAccountSigner = Keypair.generate();
          let initialLockup: Lockup | undefined = undefined;
          if (row.unlock_date) {
            initialLockup = {
              custodian: publicKey,
              epoch: 0,
              unixTimestamp: Math.floor(
                new Date(row.unlock_date).getTime() / 1000,
              ),
            };
          } else if (row.lockup_custodian) {
            // There are reasons for this, if we want to have a lockup (even a one that is not in-force),
            // the initial custodian must be the wallet that owns the stake account.
            // If the row.lockup_custodian exists, we'll change it in the next instruction.
            initialLockup = {
              custodian: publicKey,
              epoch: 0,
              unixTimestamp: 0,
            };
          }

          const tx = new Transaction({
            feePayer: publicKey,
            blockhash: value.blockhash,
            lastValidBlockHeight: value.lastValidBlockHeight,
          }).add(
            StakeProgram.createAccount({
              fromPubkey: publicKey,
              lamports: parseInt(row.stake_amount),
              stakePubkey: stakeAccountSigner.publicKey,
              authorized: {
                staker: publicKey,
                withdrawer: publicKey,
              },
              lockup: initialLockup,
            }),
          );

          if (row.validator) {
            tx.add(
              StakeProgram.delegate({
                stakePubkey: stakeAccountSigner.publicKey,
                authorizedPubkey: publicKey,
                votePubkey: new PublicKey(row.validator),
              }),
            );
          }

          if (row.stake_authority) {
            tx.add(
              StakeProgram.authorize({
                authorizedPubkey: publicKey,
                newAuthorizedPubkey: new PublicKey(row.stake_authority),
                stakePubkey: stakeAccountSigner.publicKey,
                stakeAuthorizationType: StakeAuthorizationLayout.Staker,
                custodianPubkey: publicKey,
              }),
            );
          }

          if (row.withdraw_authority) {
            tx.add(
              StakeProgram.authorize({
                authorizedPubkey: publicKey,
                newAuthorizedPubkey: new PublicKey(row.withdraw_authority),
                stakePubkey: stakeAccountSigner.publicKey,
                stakeAuthorizationType: StakeAuthorizationLayout.Withdrawer,
                custodianPubkey: publicKey,
              }),
            );
          }

          if (row.lockup_custodian) {
            tx.add(
              getSetLockupInstruction(
                StakeProgram.programId,
                stakeAccountSigner.publicKey,
                {
                  custodian: new PublicKey(row.lockup_custodian),
                },
                publicKey,
              ),
            );
          }

          tx.partialSign(stakeAccountSigner);
          const signature = await sendTransaction(tx, connection, {
            maxRetries: 0,
            preflightCommitment: "confirmed",
            skipPreflight: true,
          });

          const result = await connection.confirmTransaction(
            {
              signature,
              blockhash: value.blockhash,
              lastValidBlockHeight: value.lastValidBlockHeight!,
              minContextSlot: context.slot,
            },
            "confirmed",
          );

          if (result.value.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(result.value.err)}`,
            );
          }

          // Update status to confirmed
          txActions.updateTransactionStatus(txId, "confirmed", signature);

          notify({
            type: "success",
            title: `Stake account ${i + 1} created`,
            txid: signature,
          });
        } catch (error: any) {
          console.error(error);
          // Update status to failed
          txActions.updateTransactionStatus(
            txId,
            "failed",
            undefined,
            error.message,
          );

          notify({
            type: "error",
            title: `Failed to create stake account ${i + 1}`,
            description: error.message,
          });
          // Continue with next transaction even if one fails
        }
      }

      notify({
        type: "success",
        title: "Batch processing completed",
        description: `Successfully processed ${txState.completedTransactions} out of ${parsedData.rows.length} transactions`,
      });
    } catch (error: any) {
      notify({
        type: "error",
        title: "Batch processing failed",
        description: error.message,
      });
    } finally {
      txActions.setProcessing(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Description */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="text-lg font-medium text-blue-900">CSV Input Mode</h3>
        <p className="mt-2 text-sm text-blue-700">
          Upload a CSV file to create multiple stake accounts at once. This mode
          allows you to specify different parameters for each stake account
          including amounts, authorities, delegation targets, and lockup
          settings. Maximum 50 rows allowed.
        </p>
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
              <span className="font-medium">Required.</span> Total amount in
              lamports to stake.
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
              Lockup custodian address. Required if unlock_date is set.
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
            <svg
              className="-ml-1 mr-3 h-5 w-5 animate-spin text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
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
                    Row {error.row}, Field "{error.field}": {error.message}
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
                    ✓ Total SOL required: {parsedData.totalSol.toLocaleString()}{" "}
                    SOL
                  </p>
                  <p className="mt-2 text-xs text-green-600">
                    Note: Additional SOL will be required for transaction fees.
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
                    Please approve each transaction in your wallet when
                    prompted.
                  </p>
                </div>
              )}

              {/* Proceed Button */}
              {!txState.isProcessing && (
                <div className="flex justify-center">
                  {publicKey ? (
                    <Button
                      onClick={processTransactions}
                      disabled={txState.isProcessing}
                      className="px-8 py-2"
                    >
                      Create {parsedData.rows.length} Stake Account
                      {parsedData.rows.length > 1 ? "s" : ""}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setVisible(true)}
                      className="px-8 py-2"
                    >
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
        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                    {(tx.amount / LAMPORTS_PER_SOL).toLocaleString()} SOL
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
                      <div className="size-3 animate-spin rounded-full border-2 border-b-blue-200 border-l-blue-200 border-r-blue-200 border-t-blue-600"></div>
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
                        className="whitespace-pre font-medium text-green-700 visited:text-green-900 hover:underline"
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
