import { compress } from "@/lib/solana/common";
import { CopyButton, cn } from "@blastctrl/ui";

type Row = { mint: string; name: string } & (
  { status: "ready" | "done" } | { status: "error"; reason: string }
);

type Props = {
  rows: Row[];
  /** What a ready NFT will get, e.g. "Will transfer". */
  readyLabel: string;
  doneLabel: string;
};

/** Errors first, so they can't hide at the bottom of a long list. */
const ORDER = { error: 0, ready: 1, done: 2 } as const;

export function NftTable({ rows, readyLabel, doneLabel }: Props) {
  const counts = {
    ready: rows.filter((r) => r.status === "ready").length,
    done: rows.filter((r) => r.status === "done").length,
    error: rows.filter((r) => r.status === "error").length,
  };
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div>
      <p className="text-sm text-gray-600">
        <span className="font-medium text-indigo-700">
          {counts.ready} {readyLabel.toLowerCase()}
        </span>
        {" · "}
        <span className="text-green-700">
          {counts.done} {doneLabel.toLowerCase()}
        </span>
        {counts.error > 0 && (
          <>
            {" · "}
            <span className="text-red-700">
              {counts.error} can&apos;t be updated
            </span>
          </>
        )}
      </p>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Mint</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((row) => (
              <tr key={row.mint}>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  <CopyButton
                    clipboard={row.mint}
                    className="hover:text-indigo-700"
                  >
                    {({ copied }) =>
                      copied ? "Copied!" : compress(row.mint, 4)
                    }
                  </CopyButton>
                </td>
                <td className="max-w-40 truncate px-3 py-2">
                  {row.name || "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-xs",
                    row.status === "ready" && "text-indigo-700",
                    row.status === "done" && "text-green-700",
                    row.status === "error" && "break-all text-red-700",
                  )}
                >
                  {row.status === "ready" && readyLabel}
                  {row.status === "done" && doneLabel}
                  {row.status === "error" && row.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
