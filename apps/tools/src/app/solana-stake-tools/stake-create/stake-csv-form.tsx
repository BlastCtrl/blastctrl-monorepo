"use client";

import { InfoTooltip } from "@/components/info-tooltip";
import { isPublicKey } from "@/lib/solana/common";
import { Button } from "@blastctrl/ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Papa from "papaparse";
import { useState, useRef } from "react";

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
2000000000,,,,"2025-01-15T12:00:00Z",5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1`;

export function StakeCSVForm() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
            <div className="rounded-lg bg-green-50 p-4">
              <h4 className="font-medium text-green-800">
                CSV Validated Successfully
              </h4>
              <div className="mt-2 space-y-1 text-sm text-green-700">
                <p>✓ {parsedData.rows.length} stake accounts will be created</p>
                <p>
                  ✓ Total SOL required: {parsedData.totalSol.toLocaleString()}{" "}
                  SOL
                </p>
                <p className="mt-2 text-xs text-green-600">
                  Note: Additional SOL will be required for transaction fees.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
