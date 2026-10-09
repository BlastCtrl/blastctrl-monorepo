import { notify } from "@/components";
import {
  WalletRefusedError,
  errorMessage,
  sendBatches,
} from "@/lib/solana/send-batches";
import useQueryContext from "@/state/use-query-context";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import type { Batch } from "./transactions";
import { buildTransaction } from "./transactions";

type Status = "queued" | "signing" | "confirming" | "confirmed" | "failed";

type Progress = {
  nfts: number;
  status: Status;
  signature?: string;
  error?: string;
};

type Props = {
  /** The NFTs that are ready, packed into transactions. */
  batches: Batch[];
  /** e.g. "Transfer" or "Verify". */
  action: string;
  disabled?: boolean;
  /** After every transaction has a result, to read the NFTs again. */
  onSettled: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export function SendPanel({
  batches,
  action,
  disabled,
  onSettled,
  onBusyChange,
}: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fmtUrlWithCluster } = useQueryContext();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [busy, setBusy] = useState(false);

  const setBusyState = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };

  const patch = (index: number, value: Partial<Progress>) =>
    setProgress((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...value } : p)),
    );

  const send = async () => {
    const { publicKey } = wallet;
    if (!publicKey) return;
    if (batches.length === 0) return;

    setProgress(
      batches.map((b) => ({ nfts: b.mints.length, status: "queued" })),
    );
    setBusyState(true);
    try {
      await sendBatches(
        batches,
        {
          connection,
          wallet,
          build: (batch, lifetime) =>
            buildTransaction(batch, publicKey, lifetime),
        },
        {
          onStage: (index, stage) => patch(index, { status: stage }),
          onBatchResult: (result) =>
            patch(
              result.index,
              result.status === "confirmed"
                ? { status: "confirmed", signature: result.signature }
                : { status: "failed", error: result.error },
            ),
        },
      );
    } catch (err) {
      const refused = err instanceof WalletRefusedError;
      // Whatever didn't get a result was never sent.
      setProgress((prev) =>
        prev.map((p) =>
          p.status === "confirmed" || p.status === "failed"
            ? p
            : {
                ...p,
                status: "failed",
                error: refused ? "Cancelled in your wallet" : "Not sent",
              },
        ),
      );
      if (!refused || err.sent === 0) {
        notify({
          type: "error",
          title: refused ? "Cancelled in your wallet" : "Nothing was sent",
          description: refused ? undefined : errorMessage(err),
        });
      }
    } finally {
      setBusyState(false);
      onSettled();
    }
  };

  const ready = batches.reduce((sum, b) => sum + b.mints.length, 0);
  const transactions = batches.length;
  const failed = progress.filter((p) => p.status === "failed").length;
  const confirmed = progress.filter((p) => p.status === "confirmed").length;
  const done = !busy && progress.length > 0;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {ready === 0
            ? "Nothing left to send."
            : `${ready} ${ready === 1 ? "NFT" : "NFTs"} in ${transactions} ${transactions === 1 ? "transaction" : "transactions"}.`}
          {!wallet.signAllTransactions &&
            transactions > 1 &&
            " Your wallet will ask you to approve each one."}
        </p>
        <Button
          color="indigo"
          disabled={disabled || busy || ready === 0 || !wallet.publicKey}
          onClick={send}
        >
          {busy && <SpinnerIcon className="mr-2 -ml-1 size-5 animate-spin" />}
          {action} {ready} {ready === 1 ? "NFT" : "NFTs"}
        </Button>
      </div>

      {progress.length > 0 && (
        <>
          {busy && (
            <p className="mt-4 text-sm text-gray-500">
              Keep this window open until every transaction has a result.
            </p>
          )}
          {done && (
            <p className="mt-4 text-sm text-gray-600">
              {confirmed} of {progress.length}{" "}
              {progress.length === 1 ? "transaction" : "transactions"}{" "}
              confirmed.
              {failed > 0 &&
                " The NFTs were read again, so sending now only retries the ones that didn't go through."}
            </p>
          )}
          <ol className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-sm">
            {progress.map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="grid size-5 shrink-0 place-content-center">
                  {p.status === "queued" && (
                    <span className="size-2 rounded-full bg-gray-300" />
                  )}
                  {(p.status === "signing" || p.status === "confirming") && (
                    <SpinnerIcon className="size-5 animate-spin text-indigo-600" />
                  )}
                  {p.status === "confirmed" && (
                    <CheckCircleIcon className="size-5 text-green-600" />
                  )}
                  {p.status === "failed" && (
                    <XCircleIcon className="size-5 text-red-600" />
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    p.status === "queued" ? "text-gray-500" : "text-gray-900",
                  )}
                >
                  Transaction {i + 1}
                  <span className="ml-2 font-normal text-gray-500">
                    {p.nfts} {p.nfts === 1 ? "NFT" : "NFTs"}
                  </span>
                </span>
                <span className="min-w-0 grow text-right text-xs text-gray-500">
                  {p.status === "signing" && "Waiting for your wallet"}
                  {p.status === "confirming" && "Confirming"}
                  {p.status === "failed" && (
                    <span className="break-all text-red-700">{p.error}</span>
                  )}
                  {p.status === "confirmed" && p.signature && (
                    <a
                      href={fmtUrlWithCluster(
                        `https://solscan.io/tx/${p.signature}`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-gray-800"
                    >
                      View transaction
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
