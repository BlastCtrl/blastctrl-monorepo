"use client";

import React, { useState, useRef, ChangeEvent } from "react";
import Papa from "papaparse";
import { Button } from "@blastctrl/ui";
import { Box } from "../box";
import { MAX_RECIPIENTS } from "../common";

type Recipient = {
  address: string;
  amount: string;
};

type RecipientError = {
  address: string;
  amount: string;
};

type Errors = {
  amount: string;
  recipients: RecipientError[];
  csv: string;
};

type AirdropType = "same" | "different";
type InputMethod = "manual" | "csv";

interface CSVParseResult {
  data: string[][];
  errors: any[];
  meta: any;
}

interface AirdropData {
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  totalSol: string;
}

interface SolaceAirdropperProps {
  onNext: (data: AirdropData) => void;
}

const SolaceAirdropper = ({ onNext }: SolaceAirdropperProps) => {
  const [airdropType, setAirdropType] = useState<AirdropType>("same");
  const [amount, setAmount] = useState<string>("");
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amount: "" },
  ]);
  const [inputMethod, setInputMethod] = useState<InputMethod>("manual");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Recipient[]>([]);
  const [errors, setErrors] = useState<Errors>({
    amount: "",
    recipients: [{ address: "", amount: "" }],
    csv: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateSolAddress = (address: string): boolean => {
    // Basic validation - Solana addresses are 32-44 characters
    return address.length >= 32 && address.length <= 44;
  };

  const validateAmount = (amount: string): boolean => {
    return !isNaN(Number(amount)) && parseFloat(amount) > 0;
  };

  const handleSetAmount = (amount: string) => {
    setAmount(amount);
    setRecipients(
      recipients.map((recipient) => ({ address: recipient.address, amount })),
    );
  };

  const calculateTotalSol = (): string => {
    if (airdropType === "same") {
      const recipientCount =
        inputMethod === "manual" ? recipients.length : csvData.length;
      const amountValue = parseFloat(amount) || 0;
      return (recipientCount * amountValue).toFixed(4);
    } else {
      return csvData
        .reduce((total, recipient) => {
          const recipientAmount = parseFloat(recipient.amount) || 0;
          return total + recipientAmount;
        }, 0)
        .toFixed(4);
    }
  };

  // Handle airdrop type change
  const handleAirdropTypeChange = (type: AirdropType): void => {
    setAirdropType(type);
    if (type === "same") {
      // Reset recipients' amounts when switching to 'same' type
      const updatedRecipients = recipients.map((r) => ({ ...r, amount }));
      setRecipients(updatedRecipients);
    } else {
      // If switching to 'different', set input method to CSV
      setInputMethod("csv");
    }
  };

  // Handle manual recipient changes
  const handleRecipientChange = (
    index: number,
    field: keyof Recipient,
    value: string,
  ): void => {
    const newRecipients = [...recipients];
    if (newRecipients[index]) {
      newRecipients[index][field] = value;
      setRecipients(newRecipients);

      // Clear error for this field if it exists
      if (
        errors.recipients[index] &&
        errors.recipients[index][field as keyof RecipientError]
      ) {
        const newErrors = { ...errors };
        if (newErrors.recipients[index]) {
          newErrors.recipients[index] = {
            ...newErrors.recipients[index],
            [field]: "",
          };
          setErrors(newErrors);
        }
      }
    }
  };

  // Add new recipient field
  const addRecipient = (): void => {
    if (recipients.length < MAX_RECIPIENTS) {
      setRecipients([...recipients, { address: "", amount }]);
      setErrors({
        ...errors,
        recipients: [...errors.recipients, { address: "", amount: "" }],
      });
    }
  };

  // Remove recipient field
  const removeRecipient = (index: number): void => {
    const newRecipients = recipients.filter((_, i) => i !== index);
    setRecipients(newRecipients);

    const newErrors = { ...errors };
    newErrors.recipients = newErrors.recipients.filter((_, i) => i !== index);
    setErrors(newErrors);
  };

  // Clear CSV file and data
  const clearCsvFile = (): void => {
    setCsvFile(null);
    setCsvData([]);
    // Clear any CSV-related errors
    setErrors({
      ...errors,
      csv: "",
    });
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle CSV file upload
  const handleCsvUpload = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] || null;
    setCsvFile(file);

    if (file) {
      Papa.parse(file, {
        complete: (results: CSVParseResult) => {
          const { data } = results;

          if (airdropType === "same") {
            // For same amount, CSV should only have addresses (one per line)
            const parsedData = data
              .filter(
                (row: string[]) =>
                  row.length > 0 &&
                  typeof row[0] === "string" &&
                  row[0].trim() !== "",
              )
              .map((row: string[]) => ({
                address: row[0]?.trim() ?? "",
                amount: "",
              }));

            // Type assertion to tell TypeScript we're confident about the types
            setCsvData(parsedData as Recipient[]);
            validateCsvData(parsedData as Recipient[]);
          } else {
            // For different amounts, CSV should have address,amount pairs
            const parsedData = data
              .filter(
                (row: string[]) =>
                  row.length > 0 &&
                  typeof row[0] === "string" &&
                  row[0].trim() !== "",
              )
              .map((row: string[]) => ({
                address: row[0]?.trim() ?? "",
                amount: typeof row[1] === "string" ? row[1].trim() : "",
              }));

            // Type assertion to tell TypeScript we're confident about the types
            setCsvData(parsedData as Recipient[]);
            validateCsvData(parsedData as Recipient[]);
          }
        },
        error: (error: { message: string }) => {
          setErrors({ ...errors, csv: `Error parsing CSV: ${error.message}` });
        },
      });
    } else {
      setCsvData([]);
      setErrors({ ...errors, csv: "" });
    }
  };

  // Validate CSV data
  const validateCsvData = (data: Recipient[]): boolean => {
    let isValid = true;
    let errorMsg = "";

    if (data.length === 0) {
      isValid = false;
      errorMsg = "CSV file is empty";
    } else if (data.length > MAX_RECIPIENTS) {
      isValid = false;
      errorMsg = `CSV contains ${data.length} recipients. Maximum allowed is ${MAX_RECIPIENTS}.`;
    } else {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (typeof item === "undefined") {
          break;
        }
        const { address, amount } = item;

        if (!validateSolAddress(address)) {
          isValid = false;
          errorMsg = `Row ${i + 1}: Invalid Solana address`;
          break;
        }

        if (airdropType === "different") {
          if (!amount) {
            isValid = false;
            errorMsg = `Row ${i + 1}: Missing amount value`;
            break;
          } else if (!validateAmount(amount)) {
            isValid = false;
            errorMsg = `Row ${i + 1}: Invalid amount`;
            break;
          }
        }
      }
    }

    setErrors({ ...errors, csv: isValid ? "" : errorMsg });
    return isValid;
  };

  // Validate all inputs before enabling the next button
  const validateAll = (): boolean => {
    if (airdropType === "same" && !validateAmount(amount)) {
      return false;
    }

    if (inputMethod === "manual") {
      if (recipients.length === 0) return false;

      for (const recipient of recipients) {
        if (!validateSolAddress(recipient.address)) return false;
        if (airdropType === "different" && !validateAmount(recipient.amount))
          return false;
      }
    } else if (inputMethod === "csv") {
      if (!csvFile || errors.csv) return false;

      if (airdropType === "different") {
        // For different amounts, check that all CSV entries have valid amounts
        for (const entry of csvData) {
          if (!validateAmount(entry.amount)) {
            console.log("validation failed for", entry);
          }
        }
      }
    }

    return true;
  };

  // Handle proceeding to next step
  const handleNext = (): void => {
    // Format recipients based on input method and airdrop type
    const formattedRecipients: Recipient[] =
      inputMethod === "manual"
        ? recipients
        : csvData.map((entry: Recipient) => ({
            address: entry.address,
            amount: airdropType === "same" ? amount : entry.amount,
          }));

    // Pass data to parent component

    onNext({
      airdropType,
      amount,
      recipients: formattedRecipients,
      totalSol: calculateTotalSol(),
    });
  };

  return (
    <div>
      {/* Airdrop Type Selection */}
      <Box enableOnMobile className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex space-x-2">
            <button
              onClick={() => handleAirdropTypeChange("same")}
              className={`rounded-md px-3 py-1.5 sm:text-sm ${
                airdropType === "same"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              Same amount
            </button>
            <button
              onClick={() => handleAirdropTypeChange("different")}
              className={`rounded-md px-3 py-1.5 sm:text-sm ${
                airdropType === "different"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              Different amounts
            </button>
          </div>

          {airdropType === "same" && (
            <div className="flex items-center">
              <label className="mr-2 font-medium sm:text-sm">Amount:</label>
              <div className="flex w-32">
                <input
                  type="text"
                  name="same-amount-in-SOL"
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => handleSetAmount(e.target.value)}
                  className="w-full rounded-l border p-1.5 focus:border-blue-600 focus:outline-none sm:text-sm"
                  placeholder="0.1"
                />
                <span className="flex items-center rounded-r border border-l-0 bg-gray-100 px-2 py-1.5 text-sm">
                  SOL
                </span>
              </div>
              {errors.amount && (
                <p className="ml-2 text-xs text-red-500">{errors.amount}</p>
              )}
            </div>
          )}
        </div>
      </Box>
      {/* Recipients Input Section */}
      <Box enableOnMobile className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recipients</h2>
          <div className="flex items-center rounded-full bg-indigo-100 px-3 py-1 text-indigo-800 sm:px-2 sm:text-sm">
            <span className="mr-1 font-medium">Total:</span>{" "}
            {calculateTotalSol()} SOL
          </div>
        </div>
        <p className="mb-3 mt-1 text-stone-500 sm:text-sm">
          Maximum number of recipients is {MAX_RECIPIENTS}. If you need to do
          more, split it into multiple airdrops.
        </p>

        {airdropType === "different" && (
          <div className="mb-3 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            Different amounts mode requires uploading a CSV with addresses and
            amounts
          </div>
        )}

        {airdropType === "same" && (
          <div className="mb-3">
            <div className="flex space-x-3">
              <button
                onClick={() => setInputMethod("manual")}
                className={`rounded-md px-3 py-1.5 sm:text-sm ${
                  inputMethod === "manual"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                Manual Entry
              </button>
              <button
                onClick={() => setInputMethod("csv")}
                className={`rounded-md px-3 py-1.5 sm:text-sm ${
                  inputMethod === "csv"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                Upload CSV
              </button>
            </div>
          </div>
        )}

        {airdropType === "same" && inputMethod === "manual" ? (
          <div>
            <div className="mb-3 max-h-64 overflow-y-auto rounded border">
              {recipients.map((recipient, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 border-b p-2 last:border-b-0"
                >
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={recipient.address}
                      onChange={(e) =>
                        handleRecipientChange(index, "address", e.target.value)
                      }
                      className="w-full rounded border p-1.5 sm:text-sm"
                      placeholder="Recipient wallet address"
                    />
                    {errors.recipients[index]?.address && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.recipients[index].address}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => removeRecipient(index)}
                    className="flex size-9 items-center justify-center rounded bg-gray-200 p-1.5 hover:bg-gray-300 sm:size-8"
                    disabled={recipients.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <button
                onClick={addRecipient}
                className="rounded-md bg-gray-200 px-3 py-1.5 text-sm hover:bg-gray-300"
              >
                + Add Recipient
              </button>

              <div className="text-sm text-gray-500">
                {recipients.length}{" "}
                {recipients.length === 1 ? "recipient" : "recipients"}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCsvUpload}
                  accept=".csv"
                  className="hidden"
                />
                <div className="flex items-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md bg-gray-200 px-3 py-1.5 hover:bg-gray-300 sm:text-sm"
                  >
                    {csvFile ? "Change CSV File" : "Choose CSV File"}
                  </button>
                  {csvFile && (
                    <>
                      <span className="ml-2 text-sm">{csvFile.name}</span>
                      <button
                        onClick={clearCsvFile}
                        className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 p-1 text-xs text-gray-700 hover:bg-gray-300"
                        title="Remove CSV file"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="text-sm text-gray-500">
                {csvData.length}{" "}
                {csvData.length === 1 ? "recipient" : "recipients"}
              </div>
            </div>

            {errors.csv && (
              <p className="mb-2 text-xs text-red-500">{errors.csv}</p>
            )}

            <div className="mb-3 rounded border bg-gray-50 p-2 text-xs">
              {airdropType === "same" ? (
                <>
                  <p className="mb-1 text-gray-600">
                    Format: One wallet address per line
                  </p>
                  <p className="text-gray-600">
                    Example: 7X16ca3B9Gg9MnJ2w4EKjJHRWH5NXH8igzyeAW9Vxw3x
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-1 text-gray-600">
                    Format: "address,amount" (each on a new line)
                  </p>
                  <p className="break-all text-gray-600">
                    Example: 7X16ca3B9Gg9MnJ2w4EKjJHRWH5NXH8igzyeAW9Vxw3x,0.05
                  </p>
                </>
              )}
            </div>

            {csvData.length > 0 && (
              <div>
                <div className="max-h-64 overflow-y-auto rounded border">
                  <table className="min-w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-1.5 text-left text-xs font-medium">
                          Address
                        </th>
                        {airdropType === "different" && (
                          <th className="w-32 p-1.5 text-left text-xs font-medium">
                            Amount (SOL)
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {csvData.slice(0, 10).map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="max-w-md truncate p-1.5">
                            {row.address}
                          </td>
                          {airdropType === "different" && (
                            <td className="p-1.5">{row.amount}</td>
                          )}
                        </tr>
                      ))}
                      {csvData.length > 10 && (
                        <tr className="border-t">
                          <td
                            colSpan={airdropType === "different" ? 2 : 1}
                            className="p-1.5 text-center text-xs text-gray-500"
                          >
                            ... and {csvData.length - 10} more recipients
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <span className="text-xs text-gray-500">
                    Showing {Math.min(10, csvData.length)} of {csvData.length}{" "}
                    {csvData.length === 1 ? "recipient" : "recipients"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Box>
      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          color="indigo"
          disabled={!validateAll()}
          className="!px-6"
        >
          Review
        </Button>
      </div>
    </div>
  );
};

export default SolaceAirdropper;
