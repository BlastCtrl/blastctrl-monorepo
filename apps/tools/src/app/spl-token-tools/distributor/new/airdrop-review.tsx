import { notify } from "@/components";
import { InfoTooltip } from "@/components/info-tooltip";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import React from "react";
import { Box } from "../box";
import { useCreateAirdrop, useCreateTokenAirdrop } from "../state";
import { BATCH_SIZE, TOKEN_BATCH_SIZE } from "../common";
import { MintAddressLink } from "../mint-address-link";
import { useTokenAccountExistence } from "@/state/queries/use-token-account-existence";

type Recipient = {
  address: string;
  amount: string;
};

type AirdropType = "same" | "different";
type TokenType = "sol" | "custom";

interface SolaceAirdropReviewProps {
  balance: number;
  airdropType: AirdropType;
  amount: string;
  recipients: Recipient[];
  tokenType: TokenType;
  mintAddress: string;
  decimals: number;
  onBack: () => void;
}

const SolaceAirdropReview: React.FC<SolaceAirdropReviewProps> = ({
  airdropType,
  balance,
  amount,
  recipients,
  tokenType,
  mintAddress,
  decimals,
  onBack,
}) => {
  const { publicKey } = useWallet();
  const {
    mutate: mutateSol,
    isPending: isPendingSol,
    error: errorSol,
  } = useCreateAirdrop();
  const {
    mutate: mutateToken,
    isPending: isPendingToken,
    error: errorToken,
  } = useCreateTokenAirdrop();
  const router = useRouter();

  const isPending = isPendingSol || isPendingToken;
  const error = errorSol || errorToken;
  const [searchTerm, setSearchTerm] = React.useState("");

  // Hook to check token account existence for custom tokens
  const {
    data: tokenAccountData,
    isLoading: isLoadingTokenAccounts,
    error: tokenAccountError,
  } = useTokenAccountExistence(
    tokenType === "custom" ? mintAddress : "",
    tokenType === "custom" ? recipients.map((r) => r.address) : [],
  );

  // Constants
  const COST_PER_BATCH = 0.000005;
  const TOKEN_ACCOUNT_CREATION_COST = 2039280; // in lamports (0.00203928 SOL)

  // Calculate totals
  const recipientsCount: number = recipients.length;
  const batchesNeeded: number = Math.ceil(
    recipientsCount / (tokenType === "sol" ? BATCH_SIZE : TOKEN_BATCH_SIZE),
  );
  const transactionFee: number = batchesNeeded * COST_PER_BATCH;

  // Calculate token account creation costs
  const tokenAccountsToCreate = tokenAccountData?.accountsToCreate ?? 0;
  const tokenAccountCreationFee =
    (tokenAccountsToCreate * TOKEN_ACCOUNT_CREATION_COST) / LAMPORTS_PER_SOL;
  const totalTokenFees = transactionFee + tokenAccountCreationFee;

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
    tokenType === "sol"
      ? balance - totalDistribution - transactionFee
      : balance - totalTokenFees;
  const hasInsufficientFunds: boolean = finalBalance < 0;

  // Search
  const searchResults = recipients.filter((r) =>
    r.address.includes(searchTerm),
  );
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

    const batches: Array<Array<{ address: string; atomicAmount: number }>> = [];
    const batchSize = tokenType === "sol" ? BATCH_SIZE : TOKEN_BATCH_SIZE;
    for (let i = 0; i < recipients.length; i += batchSize) {
      batches.push(
        recipients.slice(i, i + batchSize).map((r) => ({
          address: r.address,
          atomicAmount:
            tokenType === "sol"
              ? Number(r.amount) * LAMPORTS_PER_SOL
              : Number(r.amount) * Math.pow(10, decimals),
        })),
      );
    }

    if (tokenType === "sol") {
      mutateSol(
        { batches },
        {
          onSuccess: (res) => {
            router.push(`/spl-token-tools/distributor/${res.id}`);
          },
        },
      );
    } else {
      mutateToken(
        {
          mintAddress,
          decimals,
          batches,
        },
        {
          onSuccess: (res) => {
            router.push(`/spl-token-tools/distributor/${res.id}`);
          },
        },
      );
    }
  };

  return (
    <div>
      <Box className="mb-4">
        <h1 className="font-display text-2xl font-semibold">
          Review Your Airdrop
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Please review your {tokenType === "sol" ? "SOL" : "token"}{" "}
          distribution details before proceeding.
        </p>
      </Box>

      {/* Distribution Summary */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Summary Section */}
        <Box enableOnMobile className="h-full">
          <h2 className="mb-3 text-base font-semibold">Distribution Summary</h2>

          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-600">Token Type</span>
            <span className="font-medium">
              {tokenType === "sol" ? "SOL" : "Custom Token"}
            </span>
          </div>

          {tokenType === "custom" && (
            <>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-600">Mint Address</span>
                <MintAddressLink mintAddress={mintAddress} />
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-600">Token Decimals</span>
                <span className="font-medium">{decimals}</span>
              </div>
            </>
          )}

          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-600">Distribution Method</span>
            <span className="font-medium">
              {airdropType === "same" ? "Same amount" : "Different amounts"}
            </span>
          </div>

          {airdropType === "same" && (
            <div className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-gray-600">Amount per recipient</span>
              <span className="font-medium">
                {amount} {tokenType === "sol" ? "SOL" : "Tokens"}
              </span>
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
              Total {tokenType === "sol" ? "SOL" : "tokens"} to distribute
            </span>
            <span className="font-semibold">
              {totalDistribution.toFixed(decimals)}{" "}
              {tokenType === "sol" ? "SOL" : "Tokens"}
            </span>
          </div>
        </Box>

        {/* Cost and Balance Side by Side */}
        <div className="grid grid-cols-1 gap-4">
          {/* Cost Breakdown */}
          <Box enableOnMobile className="h-full">
            <div className="flex justify-between">
              <h2 className="mb-3 text-base font-semibold">Cost Breakdown</h2>
              <div className="flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {batchesNeeded} batches × {COST_PER_BATCH} SOL fee
              </div>
            </div>

            <div className="space-y-2">
              {tokenType === "sol" && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Distribution amount</span>
                  <span>{totalDistribution.toFixed(decimals)} Tokens</span>
                </div>
              )}

              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-600">Transaction fee</span>
                <span>{transactionFee.toFixed(6)} SOL</span>
              </div>

              {tokenType === "custom" && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="flex items-center text-gray-600">
                    Token account creation
                    <InfoTooltip className="ml-1">
                      If a recipient doesn't own a token account for this token,
                      we need to create it for them. The fee is 0.00203928 SOL
                      per account.
                    </InfoTooltip>
                  </span>
                  <span>
                    {isLoadingTokenAccounts ? (
                      <span className="text-xs text-gray-500">
                        Calculating...
                      </span>
                    ) : tokenAccountError ? (
                      <span className="text-xs text-red-500">Error</span>
                    ) : (
                      `${tokenAccountsToCreate} × ${(TOKEN_ACCOUNT_CREATION_COST / LAMPORTS_PER_SOL).toFixed(8)} = ${tokenAccountCreationFee.toFixed(6)} SOL`
                    )}
                  </span>
                </div>
              )}

              <div className="mt-1 flex items-center justify-between border-t py-1.5 pt-2 text-sm">
                <span className="font-medium text-gray-800">
                  {tokenType === "sol" ? "Total SOL needed" : "Total SOL fees"}
                </span>
                <span className="font-semibold">
                  {tokenType === "sol"
                    ? `${(totalDistribution + transactionFee).toFixed(decimals)} SOL`
                    : isLoadingTokenAccounts
                      ? "Calculating..."
                      : `${totalTokenFees.toFixed(6)} SOL`}
                </span>
              </div>
            </div>
          </Box>

          {/* Balance Summary */}
          <Box enableOnMobile className="h-full">
            <h2 className="mb-3 text-base font-semibold">SOL Balance</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-600">Current SOL balance</span>
                <span>{balance.toFixed(4)} SOL</span>
              </div>

              {tokenType === "custom" && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">Token distribution</span>
                  <span className="text-xs text-gray-500">
                    Check your token balance separately
                  </span>
                </div>
              )}

              <div className="mt-1 flex items-center justify-between border-t py-1.5 pt-2 text-sm">
                <span className="font-medium text-gray-800">
                  SOL after fees
                </span>
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
      <Box className="mb-4 max-sm:mt-8">
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
              // rounded-none is needed for WebKit
              className="w-full rounded-none rounded-l border p-1.5 text-base focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-xs"
            />
          </div>
          <button
            onClick={clearSearch}
            // rounded-none is needed for WebKit
            className={`rounded-none rounded-r bg-gray-200 px-2 py-1.5 hover:bg-gray-300 sm:text-xs ${!searchTerm ? "cursor-not-allowed opacity-50" : ""}`}
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
                  Amount ({tokenType === "sol" ? "SOL" : "Tokens"})
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
      <div className="flex justify-between max-sm:mt-8">
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
          {tokenType === "sol"
            ? "You don't have enough SOL to complete this airdrop."
            : "You don't have enough SOL to cover the transaction fees for this airdrop."}
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
