import React from "react";
import { Button } from "@blastctrl/ui";
import { Box } from "./box";

// Define types
type Recipient = {
  address: string;
  amount: string;
};

type AirdropType = "same" | "different";

interface SolaceAirdropReviewProps {
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  onBack: () => void;
  onConfirm: () => void;
}

const SolaceAirdropReview: React.FC<SolaceAirdropReviewProps> = ({
  airdropType,
  amount,
  recipients,
  onBack,
  onConfirm,
}) => {
  // Constants
  const BATCH_SIZE = 6;
  const COST_PER_BATCH = 0.000005;
  const CURRENT_BALANCE = 10; // Mock user balance in SOL

  // Calculate totals
  const recipientsCount: number = recipients.length;
  const batchesNeeded: number = Math.ceil(recipientsCount / BATCH_SIZE);
  const transactionFee: number = batchesNeeded * COST_PER_BATCH;

  // Calculate total SOL to distribute
  const totalDistribution: number =
    airdropType === "same"
      ? recipientsCount * parseFloat(amount || "0")
      : recipients.reduce(
          (total, recipient) => total + parseFloat(recipient.amount || "0"),
          0,
        );

  // Calculate final balance
  const finalBalance: number =
    CURRENT_BALANCE - totalDistribution - transactionFee;
  const hasInsufficientFunds: boolean = finalBalance < 0;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <Box className="mb-4">
        <h1 className="font-display text-2xl font-semibold">
          Review Your Airdrop
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Please review your SOL distribution details before proceeding.
        </p>
      </Box>

      {/* Distribution Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Summary Section */}
        <Box className="h-full">
          <h2 className="text-base font-semibold mb-3">Distribution Summary</h2>

          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-600">Distribution Method</span>
            <span className="font-medium">
              {airdropType === "same" ? "Same amount" : "Different amounts"}
            </span>
          </div>

          {airdropType === "same" && (
            <div className="flex justify-between items-center py-1.5 text-sm">
              <span className="text-gray-600">Amount per recipient</span>
              <span className="font-medium">{amount} SOL</span>
            </div>
          )}

          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-600">Recipients</span>
            <span className="font-medium">{recipientsCount}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-600">Transaction batches</span>
            <span className="font-medium">{batchesNeeded}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-sm pt-2 border-t mt-1">
            <span className="text-gray-800 font-medium">
              Total SOL to distribute
            </span>
            <span className="font-semibold">
              {totalDistribution.toFixed(4)} SOL
            </span>
          </div>
        </Box>

        {/* Cost and Balance Side by Side */}
        <div className="grid grid-cols-1 gap-4">
          {/* Cost Breakdown */}
          <Box className="h-full">
            <div className="flex justify-between">
              <h2 className="text-base font-semibold mb-3">Cost Breakdown</h2>
              <div className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded flex items-center">
                {batchesNeeded} batches × {COST_PER_BATCH} SOL fee
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 text-sm">
                <span className="text-gray-600">Distribution amount</span>
                <span>{totalDistribution.toFixed(4)} SOL</span>
              </div>

              <div className="flex justify-between items-center py-1 text-sm">
                <span className="text-gray-600">Transaction fee</span>
                <span>{transactionFee.toFixed(6)} SOL</span>
              </div>

              <div className="flex justify-between items-center py-1.5 text-sm pt-2 border-t mt-1">
                <span className="text-gray-800 font-medium">Total cost</span>
                <span className="font-semibold">
                  {(totalDistribution + transactionFee).toFixed(4)} SOL
                </span>
              </div>
            </div>
          </Box>

          {/* Balance Summary */}
          <Box className="h-full">
            <h2 className="text-base font-semibold mb-3">Your Balance</h2>

            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 text-sm">
                <span className="text-gray-600">Current balance</span>
                <span>{CURRENT_BALANCE.toFixed(4)} SOL</span>
              </div>

              <div className="flex justify-between items-center py-1.5 text-sm pt-2 border-t mt-1">
                <span className="text-gray-800 font-medium">Final balance</span>
                <span
                  className={`font-semibold ${hasInsufficientFunds ? "text-red-600" : ""}`}
                >
                  {finalBalance.toFixed(4)} SOL
                  {hasInsufficientFunds && (
                    <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      Insufficient
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Box>
        </div>
      </div>

      {/* Recipient List Preview */}
      <Box className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-base font-semibold">Recipients</h2>
          <span className="text-xs text-gray-500">
            Showing {Math.min(5, recipientsCount)} of {recipientsCount}
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto border rounded">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-1.5 text-left text-xs font-medium">Address</th>
                <th className="p-1.5 text-right text-xs font-medium w-32">
                  Amount (SOL)
                </th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {recipients.slice(0, 5).map((recipient, index) => (
                <tr key={index} className="border-t">
                  <td className="p-1.5 truncate max-w-md">
                    {recipient.address}
                  </td>
                  <td className="p-1.5 text-right">
                    {airdropType === "same" ? amount : recipient.amount}
                  </td>
                </tr>
              ))}
              {recipientsCount > 5 && (
                <tr className="border-t">
                  <td
                    colSpan={2}
                    className="p-1.5 text-gray-500 text-center text-xs"
                  >
                    ... and {recipientsCount - 5} more recipients
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Box>

      {/* Actions */}
      <div className="flex justify-between">
        <Button onClick={onBack} color="dark/zinc" className="!px-6">
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={hasInsufficientFunds}
          color="indigo"
          className="!px-6"
        >
          Confirm Airdrop
        </Button>
      </div>

      {hasInsufficientFunds && (
        <div className="mt-2 text-center text-red-600 text-xs">
          You don't have enough SOL to complete this airdrop.
        </div>
      )}
    </div>
  );
};

export default SolaceAirdropReview;
