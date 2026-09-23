import { ChevronRightIcon } from "@heroicons/react/20/solid";
import type { ComponentProps } from "react";
import { AccountTable } from "./account-table";
import { formatSol } from "./rent";
import { excessLamports } from "./types";

type Props = ComponentProps<typeof AccountTable> & {
  /** "accounts" or "mints", for the summary line. */
  noun: string;
};

/**
 * The account table folded behind a one-line summary. Everything worth
 * taking is preselected, so most people only need the summary; the table is
 * there for anyone who wants to leave some accounts out.
 */
export function CollapsibleTable({ noun, ...table }: Props) {
  const { accounts, selectedIds, reclaimedIds } = table;
  const selectable = accounts.filter(
    (a) => !a.blockedReason && !reclaimedIds.has(a.id),
  );
  const selected = selectable.filter((a) => selectedIds.has(a.id));
  const lamports = selected.reduce((sum, a) => sum + excessLamports(a), 0);
  const reclaimed = accounts.filter((a) => reclaimedIds.has(a.id)).length;

  const summary = [
    selectable.length > 0
      ? `${selected.length} of ${selectable.length} ${noun} selected, ${formatSol(lamports, 5)} SOL`
      : null,
    reclaimed > 0 ? `${reclaimed} reclaimed` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <details className="group mt-4 rounded-md border border-zinc-200">
      <summary className="flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm marker:hidden hover:bg-zinc-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="grow font-medium tabular-nums text-zinc-900">
          {summary}
        </span>
        <span className="text-zinc-500">
          <span className="group-open:hidden">Show {noun}</span>
          <span className="hidden group-open:inline">Hide {noun}</span>
        </span>
      </summary>
      <div className="border-t border-zinc-200 [&>div]:rounded-none [&>div]:border-0">
        <AccountTable {...table} />
      </div>
    </details>
  );
}
