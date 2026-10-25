import { compress } from "@/lib/solana/common";
import useQueryContext from "@/state/use-query-context";
import { SpinnerIcon } from "@blastctrl/ui";
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import type { SkippedNft } from "./collection-plan";
import type { CollectionBatch } from "./use-collection-batches";

const STATUS_TEXT: Record<CollectionBatch["status"], string> = {
  waiting: "Waiting",
  signing: "Waiting for the wallet",
  confirming: "Confirming",
  confirmed: "Confirmed",
  failed: "Failed",
};

/** Each transaction of the last run and the NFTs that were left out. */
export function BatchStatus({
  batches,
  skipped,
}: {
  batches: CollectionBatch[] | null;
  skipped: SkippedNft[];
}) {
  const { fmtUrlWithCluster } = useQueryContext();
  if (!batches && skipped.length === 0) return null;

  return (
    <div className="space-y-4 text-sm">
      {batches && (
        <ol className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {batches.map((batch, i) => (
            <li key={i} className="flex items-center gap-x-3 px-3 py-2">
              <StatusIcon status={batch.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  Transaction {i + 1}
                  <span className="font-normal text-gray-500">
                    {" "}
                    · {batch.items.length} NFT
                    {batch.items.length === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="truncate text-gray-500">
                  {batch.error ?? STATUS_TEXT[batch.status]}
                </p>
              </div>
              {batch.signature && (
                <a
                  className="shrink-0 text-indigo-600 hover:underline"
                  href={fmtUrlWithCluster(
                    `https://solscan.io/tx/${batch.signature}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Solscan
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
      {skipped.length > 0 && (
        <div>
          <p className="font-medium text-gray-900">Skipped</p>
          <ul className="mt-1 space-y-1 text-gray-500">
            {skipped.map(({ mint, reason }) => (
              <li key={mint}>
                <span className="font-mono">{compress(mint, 4)}</span>: {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: CollectionBatch["status"] }) {
  switch (status) {
    case "confirmed":
      return <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-500" />;
    case "failed":
      return <XCircleIcon className="h-5 w-5 shrink-0 text-red-500" />;
    case "waiting":
      return <ClockIcon className="h-5 w-5 shrink-0 text-gray-400" />;
    default:
      return (
        <SpinnerIcon className="h-5 w-5 shrink-0 animate-spin text-indigo-500" />
      );
  }
}
