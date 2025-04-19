import { notify } from "@/components";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import React from "react";
import { Box } from "../box";
import { useCreateAirdrop } from "../state";
import { BATCH_SIZE } from "../common";

type Recipient = {
  address: string;
  amount: string;
};

type AirdropType = "same" | "different";

interface SolaceAirdropReviewProps {
  balance: number;
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  onBack: () => void;
}

const SolaceAirdropReview: React.FC<SolaceAirdropReviewProps> = ({
  airdropType,
  balance,
  amount,
  recipients,
  onBack,
}) => {
  const { publicKey } = useWallet();
  const { mutate, isPending, error } = useCreateAirdrop();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState("");

  // Constants
  const COST_PER_BATCH = 0.000005;

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
  const finalBalance: number = balance - totalDistribution - transactionFee;
  const hasInsufficientFunds: boolean = finalBalance < 0;

  // Search
  const searchResults = recipients.filter((r) => r.address === searchTerm);
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  const clearSearch = () => void setSearchTerm("");

  const startAirdrop = () => {
    if (!publicKey) {
      notify({
        type: "error",
        description: "Sign all transactions feature is unavailable",
      });
      return;
    }

    // const { value, context } =
    //   await connection.getLatestBlockhashAndContext("confirmed");
    const batches: Array<Array<{ address: string; lamports: number }>> = [];
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      batches.push(
        recipients.slice(i, i + BATCH_SIZE).map((r) => ({
          address: r.address,
          lamports: Number(r.amount) * LAMPORTS_PER_SOL,
        })),
      );
    }

    mutate(
      { batches },
      {
        onSuccess: (res) => {
          router.push(`/spl-token-tools/distributor/${res.id}`);
        },
      },
    );
  };

  return (
    <div>
      <Box className="mb-4">
        <h1 className="font-display text-2xl font-semibold">
          Review Your Airdrop
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Please review your SOL distribution details before proceeding.
        </p>
      </Box>

      {/* Distribution Summary */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Summary Section */}
        <Box className="h-full">
          <h2 className="mb-3 text-base font-semibold">Distribution Summary</h2>

          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-600">Distribution Method</span>
            <span className="font-medium">
              {airdropType === "same" ? "Same amount" : "Different amounts"}
            </span>
          </div>

          {airdropType === "same" && (
            <div className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-gray-600">Amount per recipient</span>
              <span className="font-medium">{amount} SOL</span>
            </div>
          )}

          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-600">Recipients</span>
            <span className="font-medium">{recipientsCount}</span>
          </div>

          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-600">Transaction batches</span>
            <span className="font-medium">{batchesNeeded}</span>
          </div>

          <div className="mt-1 flex items-center justify-between border-t py-1.5 pt-2 text-sm">
            <span className="font-medium text-gray-800">
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
              <h2 className="mb-3 text-base font-semibold">Cost Breakdown</h2>
              <div className="flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {batchesNeeded} batches × {COST_PER_BATCH} SOL fee
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-600">Distribution amount</span>
                <span>{totalDistribution.toFixed(4)} SOL</span>
              </div>

              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-600">Transaction fee</span>
                <span>{transactionFee.toFixed(6)} SOL</span>
              </div>

              <div className="mt-1 flex items-center justify-between border-t py-1.5 pt-2 text-sm">
                <span className="font-medium text-gray-800">Total cost</span>
                <span className="font-semibold">
                  {(totalDistribution + transactionFee).toFixed(4)} SOL
                </span>
              </div>
            </div>
          </Box>

          {/* Balance Summary */}
          <Box className="h-full">
            <h2 className="mb-3 text-base font-semibold">Your Balance</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-600">Current balance</span>
                <span>{balance.toFixed(4)} SOL</span>
              </div>

              <div className="mt-1 flex items-center justify-between border-t py-1.5 pt-2 text-sm">
                <span className="font-medium text-gray-800">Final balance</span>
                <span
                  className={`font-semibold ${hasInsufficientFunds ? "text-red-600" : ""}`}
                >
                  {finalBalance.toFixed(4)} SOL
                  {hasInsufficientFunds && (
                    <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
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
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recipients</h2>
          <span className="text-xs text-gray-500">
            {!searchTerm
              ? `Showing ${Math.min(5, recipientsCount)} of ${recipientsCount}`
              : `Found ${searchResults.length} matching addresses`}
          </span>
        </div>

        {/* Search Input */}
        <div className="mb-2 flex">
          <div className="relative flex-grow">
            <input
              type="search"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search for an address..."
              className="w-full rounded-l border p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={clearSearch}
            className={`rounded-r bg-gray-200 px-2 py-1.5 text-xs hover:bg-gray-300 ${!searchTerm ? "cursor-not-allowed opacity-50" : ""}`}
            disabled={!searchTerm}
          >
            Clear
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto rounded border">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-1.5 text-left text-xs font-medium">Address</th>
                <th className="w-32 p-1.5 text-right text-xs font-medium">
                  Amount (SOL)
                </th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {(searchTerm ? searchResults : recipients.slice(0, 5)).map(
                (recipient, index) => (
                  <tr key={index} className="border-t">
                    <td className="max-w-md truncate p-1.5">
                      {recipient.address}
                    </td>
                    <td className="p-1.5 text-right">
                      {airdropType === "same" ? amount : recipient.amount}
                    </td>
                  </tr>
                ),
              )}
              {!searchTerm && recipientsCount > 5 && (
                <tr className="border-t">
                  <td
                    colSpan={2}
                    className="p-1.5 text-center text-xs text-gray-500"
                  >
                    ... and {recipientsCount - 5} more recipients
                  </td>
                </tr>
              )}
              {searchTerm && searchResults.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-3 text-center text-gray-500">
                    No addresses found matching "{searchTerm}"
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
          onClick={startAirdrop}
          disabled={hasInsufficientFunds}
          color="indigo"
          className="!px-6"
        >
          {isPending && <SpinnerIcon className="size-5" />}
          Confirm Airdrop
        </Button>
      </div>

      {hasInsufficientFunds && (
        <div className="mt-2 text-center text-xs text-red-600">
          You don't have enough SOL to complete this airdrop.
        </div>
      )}
      {error && (
        <div className="mt-2 text-center text-xs text-red-600">
          {error.error}: {error.message}
        </div>
      )}
    </div>
  );
};

export default SolaceAirdropReview;
