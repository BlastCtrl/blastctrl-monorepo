"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";

const SolaceAirdropper = () => {
  const [airdropType, setAirdropType] = useState<"same" | "different">("same");
  const [amount, setAmount] = useState("");
  const [recipients, setRecipients] = useState<
    Array<{ address: string; amount: string }>
  >([{ address: "", amount: "" }]);
  const [inputMethod, setInputMethod] = useState<"manual" | "csv">("manual"); // 'manual' or 'csv'
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [errors, setErrors] = useState({
    amount: "",
    recipients: [{ address: "", amount: "" }],
    csv: "",
  });

  const recipientsPerPage = 10;
  const maxRecipients = 200;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation functions
  const validateSolAddress = (address: string) => {
    // Basic validation - Solana addresses are 32-44 characters
    return address.length >= 32 && address.length <= 44;
  };

  const validateAmount = (amount) => {
    return !isNaN(amount) && parseFloat(amount) > 0;
  };

  // Calculate total SOL to be sent
  const calculateTotalSol = () => {
    if (airdropType === "same") {
      const recipientCount =
        inputMethod === "manual" ? recipients.length : csvData.length;
      const amountValue = parseFloat(amount) || 0;
      return (recipientCount * amountValue).toFixed(4);
    } else {
      // For different amounts, sum up all the amounts in the CSV data
      return csvData
        .reduce((total, recipient) => {
          const recipientAmount = parseFloat(recipient.amount) || 0;
          return total + recipientAmount;
        }, 0)
        .toFixed(4);
    }
  };

  // Handle airdrop type change
  const handleAirdropTypeChange = (type) => {
    setAirdropType(type);
    if (type === "same") {
      // Reset recipients' amounts when switching to 'same' type
      const updatedRecipients = recipients.map((r) => ({ ...r, amount: "" }));
      setRecipients(updatedRecipients);
    } else {
      // If switching to 'different', set input method to CSV
      setInputMethod("csv");
    }
  };

  // Handle manual recipient changes
  const handleRecipientChange = (index, field, value) => {
    const newRecipients = [...recipients];
    newRecipients[index][field] = value;
    setRecipients(newRecipients);

    // Clear error for this field if it exists
    if (errors.recipients[index] && errors.recipients[index][field]) {
      const newErrors = { ...errors };
      newErrors.recipients[index] = {
        ...newErrors.recipients[index],
        [field]: "",
      };
      setErrors(newErrors);
    }
  };

  // Add new recipient field
  const addRecipient = () => {
    if (recipients.length < maxRecipients) {
      setRecipients([...recipients, { address: "", amount: "" }]);
      setErrors({
        ...errors,
        recipients: [...errors.recipients, { address: "", amount: "" }],
      });
    }
  };

  // Remove recipient field
  const removeRecipient = (index) => {
    const newRecipients = recipients.filter((_, i) => i !== index);
    setRecipients(newRecipients);

    const newErrors = { ...errors };
    newErrors.recipients = newErrors.recipients.filter((_, i) => i !== index);
    setErrors(newErrors);
  };

  // Clear CSV file and data
  const clearCsvFile = () => {
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
  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    setCsvFile(file);

    if (file) {
      Papa.parse(file, {
        complete: (results) => {
          const { data } = results;

          if (airdropType === "same") {
            // For same amount, CSV should only have addresses (one per line)
            const parsedData = data
              .filter((row) => row.length > 0 && row[0])
              .map((row) => ({
                address: row[0],
                amount: "",
              }));

            setCsvData(parsedData);
            validateCsvData(parsedData);
          } else {
            // For different amounts, CSV should have address,amount pairs
            const parsedData = data
              .filter((row) => row.length > 0 && row[0])
              .map((row) => ({
                address: row[0],
                amount: row[1] || "",
              }));

            setCsvData(parsedData);
            validateCsvData(parsedData);
          }
        },
        error: (error) => {
          setErrors({ ...errors, csv: `Error parsing CSV: ${error.message}` });
        },
      });
    } else {
      setCsvData([]);
      setErrors({ ...errors, csv: "" });
    }
  };

  // Validate CSV data
  const validateCsvData = (data) => {
    let isValid = true;
    let errorMsg = "";

    if (data.length === 0) {
      isValid = false;
      errorMsg = "CSV file is empty";
    } else if (data.length > maxRecipients) {
      isValid = false;
      errorMsg = `CSV contains ${data.length} recipients. Maximum allowed is ${maxRecipients}.`;
    } else {
      for (let i = 0; i < data.length; i++) {
        const { address, amount } = data[i];

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
  const validateAll = () => {
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
          if (!validateAmount(entry.amount)) return false;
        }
      }
    }

    return true;
  };

  // Handle proceeding to next step
  const handleNext = () => {
    console.log("Proceeding to next step with:", {
      airdropType,
      amount,
      recipients: inputMethod === "manual" ? recipients : csvData,
      totalSol: calculateTotalSol(),
    });
    // Implementation for next step would go here
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Solace Airdropper</h1>

      {/* Airdrop Type Selection */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Airdrop Configuration</h2>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex space-x-2">
            <button
              onClick={() => handleAirdropTypeChange("same")}
              className={`px-3 py-1.5 text-sm rounded-md ${
                airdropType === "same"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              Same amount
            </button>
            <button
              onClick={() => handleAirdropTypeChange("different")}
              className={`px-3 py-1.5 text-sm rounded-md ${
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
              <label className="text-sm font-medium mr-2">Amount:</label>
              <div className="flex w-32">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="p-1.5 text-sm border rounded-l w-full"
                  placeholder="0.1"
                />
                <span className="bg-gray-100 px-2 py-1.5 text-sm border border-l-0 rounded-r flex items-center">
                  SOL
                </span>
              </div>
              {errors.amount && (
                <p className="text-red-500 text-xs ml-2">{errors.amount}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recipients Input Section */}
      <div className="mb-6 p-6 bg-white rounded-lg shadow">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Recipients</h2>
          <div className="text-sm bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full flex items-center">
            <span className="font-medium mr-1">Total:</span>{" "}
            {calculateTotalSol()} SOL
          </div>
        </div>

        {airdropType === "different" && (
          <div className="mb-3 px-3 py-2 bg-indigo-50 text-indigo-800 text-sm rounded-md">
            Different amounts mode requires uploading a CSV with addresses and
            amounts
          </div>
        )}

        {airdropType === "same" && (
          <div className="mb-3">
            <div className="flex space-x-3">
              <button
                onClick={() => setInputMethod("manual")}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  inputMethod === "manual"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                Manual Entry
              </button>
              <button
                onClick={() => setInputMethod("csv")}
                className={`px-3 py-1.5 text-sm rounded-md ${
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
            <div className="max-h-64 overflow-y-auto border rounded mb-3">
              {recipients.map((recipient, index) => (
                <div
                  key={index}
                  className="flex space-x-2 p-2 border-b last:border-b-0"
                >
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={recipient.address}
                      onChange={(e) =>
                        handleRecipientChange(index, "address", e.target.value)
                      }
                      className="p-1.5 text-sm border rounded w-full"
                      placeholder="Recipient wallet address"
                    />
                    {errors.recipients[index]?.address && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.recipients[index].address}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => removeRecipient(index)}
                    className="p-1.5 bg-gray-200 rounded hover:bg-gray-300 h-8 w-8 flex items-center justify-center"
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
                className="px-3 py-1.5 text-sm bg-gray-200 rounded-md hover:bg-gray-300"
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
            <div className="flex justify-between items-center mb-3">
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
                    onClick={() => fileInputRef.current.click()}
                    className="px-3 py-1.5 text-sm bg-gray-200 rounded-md hover:bg-gray-300"
                  >
                    {csvFile ? "Change CSV File" : "Choose CSV File"}
                  </button>
                  {csvFile && (
                    <>
                      <span className="ml-2 text-sm">{csvFile.name}</span>
                      <button
                        onClick={clearCsvFile}
                        className="ml-2 p-1 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 h-6 w-6 flex items-center justify-center text-xs"
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
              <p className="text-red-500 text-xs mb-2">{errors.csv}</p>
            )}

            <div className="bg-gray-50 p-2 rounded border mb-3 text-xs">
              {airdropType === "same" ? (
                <>
                  <p className="text-gray-600 mb-1">
                    Format: One wallet address per line
                  </p>
                  <p className="text-gray-600">
                    Example: 7X16ca3B9Gg9MnJ2w4EKjJHRWH5NXH8igzyeAW9Vxw3x
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-1">
                    Format: "address,amount" (each on a new line)
                  </p>
                  <p className="text-gray-600">
                    Example: 7X16ca3B9Gg9MnJ2w4EKjJHRWH5NXH8igzyeAW9Vxw3x,0.05
                  </p>
                </>
              )}
            </div>

            {csvData.length > 0 && (
              <div>
                <div className="max-h-64 overflow-y-auto border rounded">
                  <table className="min-w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-1.5 text-left text-xs font-medium">
                          Address
                        </th>
                        {airdropType === "different" && (
                          <th className="p-1.5 text-left text-xs font-medium w-32">
                            Amount (SOL)
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {csvData.slice(0, 10).map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-1.5 truncate max-w-md">
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
                            className="p-1.5 text-gray-500 text-center text-xs"
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
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!validateAll()}
          className={`px-6 py-3 rounded-md ${
            validateAll()
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          Next Step
        </button>
      </div>
    </div>
  );
};

export default SolaceAirdropper;
