import { Badge } from "@/components/badge";
import { compress } from "@/lib/solana/common";
import { CopyButton, cn } from "@blastctrl/ui";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { useLayoutEffect, useRef } from "react";
import { formatSol } from "./rent";
import { TokenAvatar } from "./token-avatar";
import type { ReclaimableAccount } from "./types";
import { excessLamports } from "./types";

type Props = {
  accounts: ReclaimableAccount[];
  selectedIds: Set<string>;
  reclaimedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
};

export function AccountTable({
  accounts,
  selectedIds,
  reclaimedIds,
  onToggle,
  onToggleAll,
}: Props) {
  const headerCheckbox = useRef<HTMLInputElement>(null);
  const selectable = accounts.filter(
    (a) => !a.blockedReason && !reclaimedIds.has(a.id),
  );
  const selectedCount = selectable.filter((a) => selectedIds.has(a.id)).length;
  const allSelected =
    selectable.length > 0 && selectedCount === selectable.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useLayoutEffect(() => {
    if (headerCheckbox.current) {
      headerCheckbox.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div className="overflow-clip rounded-md border border-zinc-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-1 bg-zinc-100 text-zinc-600">
          <tr>
            <th className="w-10 py-2 pl-3 font-medium">
              <input
                ref={headerCheckbox}
                type="checkbox"
                aria-label="Select all accounts"
                checked={allSelected}
                disabled={selectable.length === 0}
                onChange={() => onToggleAll(!allSelected)}
                className="form-checkbox rounded-sm accent-indigo-600"
              />
            </th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">
              Program
            </th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Rent</th>
            <th className="px-3 py-2 text-right font-medium">Reclaimable</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              selected={selectedIds.has(account.id)}
              reclaimed={reclaimedIds.has(account.id)}
              onToggle={() => onToggle(account.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountRow({
  account,
  selected,
  reclaimed,
  onToggle,
}: {
  account: ReclaimableAccount;
  selected: boolean;
  reclaimed: boolean;
  onToggle: () => void;
}) {
  const disabled = !!account.blockedReason || reclaimed;
  const excess = excessLamports(account);

  return (
    <tr
      onClick={disabled ? undefined : onToggle}
      className={cn(
        "transition-colors",
        disabled ? "text-zinc-400" : "cursor-pointer",
        !disabled && (selected ? "bg-indigo-600/5" : "hover:bg-zinc-50"),
      )}
    >
      <td className="py-2 pl-3">
        <input
          type="checkbox"
          aria-label={`Select ${account.name}`}
          checked={selected && !disabled}
          disabled={disabled}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="form-checkbox rounded-sm accent-indigo-600 disabled:opacity-40"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-3">
          <TokenAvatar
            symbol={account.symbol}
            image={account.image}
            muted={disabled}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2">
              <span
                className={cn(
                  "truncate font-medium",
                  !disabled && "text-zinc-900",
                )}
              >
                {account.name}
              </span>
              {account.isEmpty && <Badge color="zinc">Empty</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              <CopyButton
                clipboard={account.address}
                className="tabular-nums hover:text-zinc-800"
              >
                {({ copied }) =>
                  copied ? "Copied!" : compress(account.address, 4)
                }
              </CopyButton>
              {account.kind === "token-account" && !account.isEmpty && (
                <span>
                  {account.tokenBalance} {account.symbol}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-2 sm:table-cell">
        <span className="whitespace-nowrap text-zinc-600">
          {account.program === "token" ? "Token" : "Token-2022"}
        </span>
      </td>
      <td className="hidden px-3 py-2 md:table-cell">
        {!account.blockedReason && (
          <DepositBar account={account} reclaimed={reclaimed} />
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {account.blockedReason ? (
          <span className="text-xs">{account.blockedReason}</span>
        ) : reclaimed ? (
          <span className="inline-flex items-center gap-1 font-medium text-green-700">
            <CheckCircleIcon className="size-4" aria-hidden="true" />
            Reclaimed
          </span>
        ) : (
          <div>
            <div className="font-medium whitespace-nowrap text-zinc-900 tabular-nums">
              {formatSol(excess, 6, 6)} SOL
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

/** What the account holds, split into what must stay and what can leave. */
function DepositBar({
  account,
  reclaimed,
}: {
  account: ReclaimableAccount;
  reclaimed: boolean;
}) {
  const needed = account.minimum;
  const excess = excessLamports(account);
  const neededShare = (needed / account.lamports) * 100;

  return (
    <div className="w-36">
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className="bg-zinc-400" style={{ width: `${neededShare}%` }} />
        <div
          className="bg-indigo-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: reclaimed ? "0%" : `${100 - neededShare}%` }}
        />
      </div>
      <div className="mt-1 text-xs whitespace-nowrap text-zinc-500 tabular-nums">
        {reclaimed
          ? `Holds ${formatSol(needed, 5, 5)}, the minimum`
          : `Holds ${formatSol(needed + excess, 5, 5)}, needs ${formatSol(needed, 5, 5)}`}
      </div>
    </div>
  );
}
