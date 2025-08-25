import { useAssetData } from "@/state/queries/use-asset-data";
import {
  useDelegatedAssets,
  type ParsedDelegatedTokenAccount,
} from "@/state/queries/use-delegated-assets";
import { compress, normalizeTokenAmount } from "@/lib/solana";
import { Button, CopyButton, cn } from "@blastctrl/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { retryWithBackoff } from "@/lib/utils";
import { createRevokeInstruction } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "@/components";
import { RotateCwIcon } from "@/components/icons/rotate-cw";

type CheckboxState = "indeterminate" | "checked" | "empty";

export const AccountList = ({
  delegatedAccounts,
}: {
  delegatedAccounts: ParsedDelegatedTokenAccount[];
}) => {
  const { publicKey } = useWallet();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [checkboxState, setCheckboxState] = useState<CheckboxState>("empty");
  const [selectedAccounts, setSelectedAccounts] = useState<
    typeof delegatedAccounts
  >([]);

  useLayoutEffect(() => {
    const isIndeterminate =
      selectedAccounts.length > 0 &&
      selectedAccounts.length < delegatedAccounts.length;
    const isChecked = selectedAccounts.length === delegatedAccounts.length;
    setCheckboxState(
      isIndeterminate ? "indeterminate" : isChecked ? "checked" : "empty",
    );
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedAccounts, delegatedAccounts.length]);

  const toggleAll = () => {
    setSelectedAccounts(checkboxState === "empty" ? delegatedAccounts : []);
    setCheckboxState(checkboxState === "empty" ? "checked" : "empty");
  };

  return (
    <div className="size-full">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="text-sm">
          {selectedAccounts.length} accounts selected
        </div>
        <RefreshAccountListButton />
        <RevokeDelegationsButton selectedAccounts={selectedAccounts} />
      </div>

      <Table
        dense
        className="scroller -mx-4 h-[500px] max-h-[500px] overflow-auto rounded pb-4 sm:-mx-6"
      >
        <TableHead className="sticky top-0 z-[1]">
          <TableRow className="bg-zinc-100 font-medium text-zinc-500">
            <TableHeader className="sticky top-0">
              <div className="grid w-full place-content-center">
                <input
                  ref={checkboxRef}
                  checked={checkboxState === "checked"}
                  onChange={toggleAll}
                  type="checkbox"
                  className="form-checkbox mx-auto rounded accent-blue-600"
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
                  isSelected ? "bg-blue-600/[5%]" : "hover:bg-blue-600/[2.5%]",
                )}
                key={account.token_account}
              >
                <TableCell>
                  <div className="grid w-full place-content-center">
                    <input
                      type="checkbox"
                      value={account.token_account}
                      checked={isSelected}
                      onChange={(e) =>
                        setSelectedAccounts(
                          e.target.checked
                            ? [...selectedAccounts, account]
                            : selectedAccounts.filter((a) => a !== account),
                        )
                      }
                      className="form-checkbox rounded accent-blue-600"
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
  const { publicKey } = useWallet();
  const { refetch, isRefetching } = useDelegatedAssets(
    publicKey?.toString() ?? "",
  );

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
      className="group ml-auto !h-[36px] !px-2.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCwIcon className="size-5 group-data-[refetching]:animate-[spin_0.38s_normal_forwards_ease-in-out]" />
    </Button>
  );
}

function RevokeDelegationsButton({
  selectedAccounts,
}: {
  selectedAccounts: ParsedDelegatedTokenAccount[];
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();

  const handleRevokeDelegations = async () => {
    if (!publicKey || !sendTransaction) return;
    const { value } = await retryWithBackoff(() =>
      connection.getLatestBlockhashAndContext({ commitment: "confirmed" }),
    );

    const tx = new Transaction({ feePayer: publicKey, ...value }).add(
      ...selectedAccounts.map((account) =>
        createRevokeInstruction(
          new PublicKey(account.token_account),
          publicKey,
          [],
          new PublicKey(account.token_program),
        ),
      ),
    );

    if (
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
        .length > 1232
    ) {
      notify({
        type: "error",
        title: "Transaction size limit error",
        description:
          "The transaction has exceeded the size limit. Try including fewer accounts.",
      });
      return;
    }

    const signature = await sendTransaction(tx, connection, {
      preflightCommitment: "confirmed",
      skipPreflight: true,
      maxRetries: 0,
    });
    await connection.confirmTransaction({
      blockhash: value.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight,
      signature,
    });

    notify({
      type: "success",
      title: "Transaction confirmed",
      txid: signature,
    });
  };

  return (
    <Button
      color="indigo"
      onClick={handleRevokeDelegations}
      disabled={selectedAccounts.length === 0}
    >
      Revoke Delegations ({selectedAccounts.length})
    </Button>
  );
}
