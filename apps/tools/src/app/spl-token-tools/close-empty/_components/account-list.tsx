import { useAssetData } from "@/state/queries/use-asset-data";
import type { ParsedTokenAccount } from "@/state/queries/use-owner-assets";
import { compress } from "@/lib/solana";
import { Button, CopyButton, cn } from "@blastctrl/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blastctrl/ui/table";
import { useLayoutEffect, useRef, useState } from "react";
import { CloseAccountWizard } from "./wizard/wizard-dialog";

type CheckboxState = "indeterminate" | "checked" | "empty";

export const AccountList = ({
  tokenAccounts,
}: {
  tokenAccounts: ParsedTokenAccount[];
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [checkboxState, setCheckboxState] = useState<CheckboxState>("empty");
  const [selectedAccounts, setSelectedAccounts] = useState<
    typeof tokenAccounts
  >([]);
  const [openWizard, setOpenWizard] = useState(false);

  useLayoutEffect(() => {
    const isIndeterminate =
      selectedAccounts.length > 0 &&
      selectedAccounts.length < tokenAccounts.length;
    const isChecked = selectedAccounts.length === tokenAccounts.length;
    setCheckboxState(
      isIndeterminate ? "indeterminate" : isChecked ? "checked" : "empty",
    );
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedAccounts, tokenAccounts.length]);

  const toggleAll = () => {
    setSelectedAccounts(checkboxState === "empty" ? tokenAccounts : []);
    setCheckboxState(checkboxState === "empty" ? "checked" : "empty");
  };

  return (
    <div className="size-full">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="text-sm">
          {selectedAccounts.length} accounts selected
        </div>
        <Button
          onClick={() => setOpenWizard(true)}
          disabled={selectedAccounts.length === 0}
        >
          Go to checkout
        </Button>
      </div>

      {openWizard && (
        <CloseAccountWizard
          open={openWizard}
          onClose={() => setOpenWizard(false)}
          accountsToClose={selectedAccounts}
        />
      )}

      <Table
        dense
        className="scroller h-[500px] max-h-[500px] overflow-auto rounded pb-4"
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
                  className="mx-auto rounded accent-blue-600"
                />
              </div>
            </TableHeader>
            <TableHeader className="sticky top-0">Token info</TableHeader>
            <TableHeader className="sticky top-0">Account</TableHeader>
            <TableHeader className="sticky top-0 hidden sm:table-cell">
              Program
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {tokenAccounts.map((account) => {
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
                      className="rounded accent-blue-600"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <TokenMetadataCell mint={account.mint} />
                </TableCell>
                <TableCell>
                  <div>
                    <div>{account.balance.toString()} tokens</div>
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
