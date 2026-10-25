import { notify } from "@/components";
import { RotateCwIcon } from "@/components/icons/rotate-cw";
import { transactionErrorMessage } from "@/connector/transaction-error";
import { useKitClient, type KitClient } from "@/connector/use-kit-client";
import { compress, normalizeTokenAmount } from "@/lib/solana";
import { useAssetData } from "@/state/queries/use-asset-data";
import {
  useDelegatedAssets,
  type ParsedDelegatedTokenAccount,
} from "@/state/queries/use-delegated-assets";
import { Button, Checkbox, CopyButton, SpinnerIcon, cn } from "@blastctrl/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import { getRevokeInstruction } from "@solana-program/token";
import { useConnector } from "@solana/connector/react";
import {
  address,
  flattenTransactionPlanResult,
  parallelInstructionPlan,
  type TransactionSigner,
} from "@solana/kit";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** One `Revoke` per account, signed by `owner`, on each account's own token program. */
function revokeInstructions(
  accounts: ParsedDelegatedTokenAccount[],
  owner: TransactionSigner,
) {
  return accounts.map((acc) =>
    getRevokeInstruction(
      { source: address(acc.token_account), owner },
      { programAddress: address(acc.token_program) },
    ),
  );
}

/**
 * Sends the `revokeInstructions`; resolves with the signatures of the
 * transactions that landed.
 */
async function sendRevokeInstructions(
  client: KitClient,
  instructions: ReturnType<typeof revokeInstructions>,
) {
  // Revokes are independent, so the planner packs as many as fit into one
  // transaction and sends any overflow as further transactions.
  const result = await client.sendTransactions(
    parallelInstructionPlan(instructions),
  );
  return flattenTransactionPlanResult(result)
    .filter((r) => r.status === "successful")
    .map((r) => r.context.signature);
}

type CheckboxState = "indeterminate" | "checked" | "empty";

export const AccountList = ({
  delegatedAccounts,
}: {
  delegatedAccounts: ParsedDelegatedTokenAccount[];
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<
    typeof delegatedAccounts
  >([]);

  const isIndeterminate =
    selectedAccounts.length > 0 &&
    selectedAccounts.length < delegatedAccounts.length;

  const isChecked =
    delegatedAccounts.length > 0 &&
    selectedAccounts.length === delegatedAccounts.length;

  const checkboxState: CheckboxState = isIndeterminate
    ? "indeterminate"
    : isChecked
      ? "checked"
      : "empty";

  useLayoutEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const toggleAll = () => {
    setSelectedAccounts(isChecked || isIndeterminate ? [] : delegatedAccounts);
  };

  return (
    <div className="size-full">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="text-sm">
          {selectedAccounts.length} accounts selected
        </div>
        <RefreshAccountListButton />
        <RevokeDelegationsButton
          selectedAccounts={selectedAccounts}
          onRevoked={() => setSelectedAccounts([])}
        />
      </div>

      <Table
        dense
        className="scroller -mx-4 h-[500px] max-h-[500px] overflow-auto rounded-sm pb-4 sm:-mx-6"
      >
        <TableHead className="sticky top-0 z-1">
          <TableRow className="bg-zinc-100 font-medium text-zinc-500">
            <TableHeader className="sticky top-0">
              <div className="grid w-full place-content-center">
                <Checkbox
                  ref={checkboxRef}
                  checked={checkboxState === "checked"}
                  onChange={toggleAll}
                  className="mx-auto"
                />
              </div>
            </TableHeader>
            <TableHeader className="sticky top-0">Token info</TableHeader>
            <TableHeader className="sticky top-0">Delegated Amount</TableHeader>
            <TableHeader className="sticky top-0">Delegate Address</TableHeader>
            <TableHeader className="sticky top-0">Account</TableHeader>
            <TableHeader className="sticky top-0 hidden sm:table-cell">
              Program
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {delegatedAccounts.map((account) => {
            const isSelected = selectedAccounts.includes(account);
            return (
              <TableRow
                onClick={() => {
                  if (isSelected) {
                    setSelectedAccounts(
                      selectedAccounts.filter((a) => a !== account),
                    );
                  } else {
                    setSelectedAccounts([...selectedAccounts, account]);
                  }
                }}
                className={cn(
                  isSelected ? "bg-blue-600/5" : "hover:bg-blue-600/2.5",
                )}
                key={account.token_account}
              >
                <TableCell>
                  <div className="grid w-full place-content-center">
                    <Checkbox
                      value={account.token_account}
                      checked={isSelected}
                      onChange={(e) =>
                        setSelectedAccounts(
                          e.target.checked
                            ? [...selectedAccounts, account]
                            : selectedAccounts.filter((a) => a !== account),
                        )
                      }
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <TokenMetadataCell mint={account.mint} />
                </TableCell>
                <TableCell>
                  <TokenAmountCell
                    amount={account.delegated_amount}
                    mint={account.mint}
                  />
                </TableCell>
                <TableCell>
                  <CopyButton
                    clipboard={account.delegate}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    {({ copied }) =>
                      copied ? "Copied!" : compress(account.delegate, 4)
                    }
                  </CopyButton>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="text-sm text-zinc-600">
                      Balance:{" "}
                      <TokenAmountCell
                        amount={account.balance}
                        mint={account.mint}
                        showInline
                      />
                    </div>
                    <CopyButton
                      clipboard={account.token_account}
                      className="text-zinc-500 hover:text-zinc-800"
                    >
                      {({ copied }) =>
                        copied ? "Copied!" : compress(account.token_account, 4)
                      }
                    </CopyButton>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <CopyButton
                    clipboard={account.token_program}
                    className="text-zinc-500 hover:text-zinc-800 focus:text-zinc-800"
                  >
                    {({ copied }) =>
                      copied
                        ? "Copied!"
                        : account.token_program.slice(0, 8) + "..."
                    }
                  </CopyButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

const TokenAmountCell = ({
  amount,
  mint,
  showInline = false,
}: {
  amount: bigint;
  mint: string;
  showInline?: boolean;
}) => {
  const { data } = useAssetData(mint);
  const decimals = data?.token_info?.decimals ?? 9;
  const formattedAmount = normalizeTokenAmount(
    amount.toString(),
    decimals,
  ).toLocaleString();

  if (showInline) {
    return <span className="font-mono">{formattedAmount}</span>;
  }

  return <div className="font-mono text-sm">{formattedAmount}</div>;
};

const TokenMetadataCell = ({ mint }: { mint: string }) => {
  const { data } = useAssetData(mint);

  return (
    <div className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data?.content?.links?.image}
        loading="lazy"
        alt=""
        height={28}
        width={28}
        className="size-7 rounded-full"
      />
      <div>
        <div className="truncate font-medium">
          {data?.content?.metadata.name}
        </div>
        <CopyButton
          clipboard={mint}
          className="text-zinc-500 hover:text-zinc-800 focus:text-zinc-800"
        >
          {({ copied }) => (copied ? "Copied!" : compress(mint, 4))}
        </CopyButton>
      </div>
    </div>
  );
};

function RefreshAccountListButton() {
  const { account } = useConnector();
  const { refetch, isRefetching } = useDelegatedAssets(account ?? "");

  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const handleRateLimitedRefresh = useCallback(() => {
    if (isButtonDisabled) return;

    setIsButtonDisabled(true);
    void refetch();

    // Re-enable after 2 seconds
    setTimeout(() => {
      setIsButtonDisabled(false);
    }, 2000);
  }, [isButtonDisabled, refetch]);

  return (
    <Button
      onClick={handleRateLimitedRefresh}
      aria-label="Refresh data"
      data-refetching={isRefetching ? true : undefined}
      disabled={isButtonDisabled || isRefetching}
      className="group ml-auto h-[36px]! px-2.5! disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCwIcon className="size-5 group-data-refetching:animate-[spin_0.38s_normal_forwards_ease-in-out]" />
    </Button>
  );
}

function RevokeDelegationsButton({
  selectedAccounts,
  onRevoked,
}: {
  selectedAccounts: ParsedDelegatedTokenAccount[];
  onRevoked: () => void;
}) {
  const { client } = useKitClient();
  const { account } = useConnector();
  const { refetch } = useDelegatedAssets(account ?? "");
  const [isConfirming, setIsConfirming] = useState(false);

  const handleRevokeDelegations = async () => {
    if (!client || selectedAccounts.length === 0) return;

    const instructions = revokeInstructions(selectedAccounts, client.payer);

    setIsConfirming(true);
    try {
      const signatures = await sendRevokeInstructions(client, instructions);

      signatures.forEach((signature, index) => {
        notify({
          type: "success",
          title:
            signatures.length > 1
              ? `Transaction ${index + 1} of ${signatures.length} confirmed`
              : "Transaction confirmed",
          txid: signature,
        });
      });
      onRevoked();
      void refetch();
    } catch (error) {
      notify({
        type: "error",
        title: "Transaction error",
        description: transactionErrorMessage(error),
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Button
      color="indigo"
      onClick={handleRevokeDelegations}
      disabled={!client || isConfirming || selectedAccounts.length === 0}
    >
      {isConfirming ? (
        <>
          <SpinnerIcon className="mr-2 -ml-1 size-5 animate-spin" />
          Confirming
        </>
      ) : (
        `Revoke Delegations (${selectedAccounts.length})`
      )}
    </Button>
  );
}
