import { notify } from "@/components/notification";
import { compress } from "@/lib/solana/common";
import { Button, CopyButton, SpinnerIcon, cn } from "@blastctrl/ui";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
  formatSol,
  remainingSteps,
} from "./rent";
import type { ReclaimableAccount } from "./types";
import { excessLamports } from "./types";
import { useReclaimExcess } from "./use-reclaim-excess";
import { useRentRate } from "./use-rent-rate";

type Batch = {
  accounts: ReclaimableAccount[];
  lamports: number;
  status: "queued" | "sending" | "confirmed" | "failed";
  signature?: string;
  error?: string;
};

type Phase = "review" | "signing" | "sending" | "done";

type Props = {
  accounts: ReclaimableAccount[];
  onConfirmed: (ids: string[]) => void;
  onSettled?: () => void;
  onClose: () => void;
};

function toBatches(accounts: ReclaimableAccount[]): Batch[] {
  const batches: Batch[] = [];
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_TRANSACTION) {
    const slice = accounts.slice(i, i + ACCOUNTS_PER_TRANSACTION);
    batches.push({
      accounts: slice,
      lamports: slice.reduce((sum, a) => sum + excessLamports(a), 0),
      status: "queued",
    });
  }
  return batches;
}

export function ReclaimDialog({
  accounts,
  onConfirmed,
  onSettled,
  onClose,
}: Props) {
  const { publicKey } = useWallet();
  const stepsLeft = remainingSteps(useRentRate().lamportsPerByte);
  const [phase, setPhase] = useState<Phase>("review");
  const [batches, setBatches] = useState(() => toBatches(accounts));
  const [signingCount, setSigningCount] = useState(0);

  const total = batches.reduce((sum, b) => sum + b.lamports, 0);
  const fees = batches.length * FEE_PER_TRANSACTION;
  const confirmed = batches.filter((b) => b.status === "confirmed");
  const failed = batches.filter((b) => b.status === "failed");
  const reclaimed = confirmed.reduce((sum, b) => sum + b.lamports, 0);
  const busy = phase === "signing" || phase === "sending";

  const setStatus = (index: number, patch: Partial<Batch>) =>
    setBatches((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );

  const reclaim = useReclaimExcess({
    onBatchResult: (result) => {
      setPhase("sending");
      if (result.status === "confirmed") {
        setStatus(result.index, {
          status: "confirmed",
          signature: result.signature,
        });
        onConfirmed(batches[result.index]!.accounts.map((a) => a.id));
      } else {
        setStatus(result.index, { status: "failed", error: result.error });
      }
    },
    onSettled,
  });

  const run = async (indexes: number[]) => {
    setPhase("signing");
    setSigningCount(indexes.length);
    indexes.forEach((i) =>
      setStatus(i, { status: "sending", error: undefined }),
    );
    try {
      await reclaim.mutateAsync({
        batches: indexes.map((index) => ({
          index,
          accounts: batches[index]!.accounts,
        })),
      });
      setPhase("done");
    } catch (err) {
      // Nothing was sent (usually the wallet rejected signing).
      indexes.forEach((i) => setStatus(i, { status: "queued" }));
      setPhase(
        batches.some((b) => b.status === "confirmed") ? "done" : "review",
      );
      notify({
        type: "error",
        title: "Nothing was sent",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const title = () => {
    if (phase === "review") return `Reclaim ${formatSol(total - fees)} SOL`;
    if (phase === "signing") {
      return signingCount === 1
        ? "Approve the transaction in your wallet"
        : `Approve ${signingCount} transactions in your wallet`;
    }
    if (phase === "sending") return "Reclaiming";
    if (failed.length > 0) {
      return `Reclaimed ${formatSol(reclaimed)} of ${formatSol(total)} SOL`;
    }
    return `Reclaimed ${formatSol(reclaimed)} SOL`;
  };

  return (
    <Dialog open onClose={busy ? () => {} : onClose}>
      <div className="fixed inset-0 z-[50] bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 z-[50] flex w-screen items-center justify-center p-4">
        <DialogPanel className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-lg">
          <DialogTitle
            aria-live="polite"
            className="font-display flex items-center gap-3 px-6 pt-6 text-xl font-semibold"
          >
            {phase === "signing" && (
              <SpinnerIcon className="size-5 shrink-0 animate-spin text-indigo-600" />
            )}
            {title()}
          </DialogTitle>

          <div className="overflow-y-auto px-6 pb-2 pt-4">
            {phase === "review" ? (
              <Review
                accounts={accounts}
                batches={batches}
                wallet={publicKey?.toBase58() ?? ""}
              />
            ) : (
              <BatchList batches={batches} />
            )}

            {phase === "done" && failed.length === 0 && (
              <p className="mt-4 text-sm text-zinc-600">
                The SOL is in your wallet.
                {stepsLeft > 0 &&
                  ` Rent drops ${stepsLeft === 1 ? "once more" : `${stepsLeft} more times`}, expected in November. After each drop, the same accounts will have more to reclaim.`}
              </p>
            )}
            {phase === "done" && failed.length > 0 && (
              <p className="mt-4 text-sm text-zinc-600">
                {failed.length === 1
                  ? "One transaction didn't go through. Its accounts are untouched, so you can send it again."
                  : `${failed.length} transactions didn't go through. Their accounts are untouched, so you can send them again.`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 px-6 pb-6 pt-4">
            {phase === "review" && (
              <>
                <Button plain onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  color="indigo"
                  onClick={() => run(batches.map((_, i) => i))}
                >
                  Reclaim {formatSol(total - fees)} SOL
                </Button>
              </>
            )}
            {busy && (
              <p className="mr-auto text-sm text-zinc-500">
                Keep this window open until every transaction is confirmed.
              </p>
            )}
            {phase === "done" && (
              <>
                {failed.length > 0 && (
                  <Button
                    outline
                    onClick={() =>
                      run(
                        batches.flatMap((b, i) =>
                          b.status === "failed" ? [i] : [],
                        ),
                      )
                    }
                  >
                    Send failed {failed.length === 1 ? "transaction" : "ones"}{" "}
                    again
                  </Button>
                )}
                <Button color="indigo" onClick={onClose}>
                  Done
                </Button>
              </>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function Review({
  accounts,
  batches,
  wallet,
}: {
  accounts: ReclaimableAccount[];
  batches: Batch[];
  wallet: string;
}) {
  const total = batches.reduce((sum, b) => sum + b.lamports, 0);
  const fees = batches.length * FEE_PER_TRANSACTION;
  const mints = accounts.filter((a) => a.kind === "mint").length;
  const tokenAccounts = accounts.length - mints;

  return (
    <>
      <p className="text-sm text-zinc-600">
        Your tokens stay where they are and no account is closed. Each account
        keeps exactly the deposit it needs today, and the rest goes to your
        wallet.
      </p>
      <dl className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200 text-sm">
        <Row label="From">
          {[
            tokenAccounts > 0 &&
              `${tokenAccounts} token ${tokenAccounts === 1 ? "account" : "accounts"}`,
            mints > 0 && `${mints} ${mints === 1 ? "mint" : "mints"}`,
          ]
            .filter(Boolean)
            .join(" and ")}
        </Row>
        <Row label="To">
          <span className="tabular-nums">{compress(wallet, 4)}</span>, your
          wallet
        </Row>
        <Row label="Excess deposit">{formatSol(total)} SOL</Row>
        <Row
          label={`Network fees, ${batches.length} ${batches.length === 1 ? "transaction" : "transactions"}`}
        >
          −{formatSol(fees)} SOL
        </Row>
        <Row label="You receive" strong>
          {formatSol(total - fees)} SOL
        </Row>
      </dl>
      {batches.length > 1 && (
        <p className="mt-3 text-xs text-zinc-500">
          One transaction fits {ACCOUNTS_PER_TRANSACTION} accounts. Your wallet
          asks you to approve all {batches.length} at once.
        </p>
      )}
    </>
  );
}

function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 px-3 py-2",
        strong && "bg-indigo-50/60 font-semibold text-zinc-900",
      )}
    >
      <dt className={cn(!strong && "text-zinc-500")}>{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function BatchList({ batches }: { batches: Batch[] }) {
  return (
    <ol className="divide-y divide-zinc-100 rounded-md border border-zinc-200 text-sm">
      {batches.map((batch, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid size-5 shrink-0 place-content-center">
            {batch.status === "queued" && (
              <span className="size-2 rounded-full bg-zinc-300" />
            )}
            {batch.status === "sending" && (
              <SpinnerIcon className="size-5 animate-spin text-indigo-600" />
            )}
            {batch.status === "confirmed" && (
              <CheckCircleIcon className="size-5 text-green-600" />
            )}
            {batch.status === "failed" && (
              <XCircleIcon className="size-5 text-red-600" />
            )}
          </span>
          <div className="min-w-0 grow">
            <div
              className={cn(
                "font-medium",
                batch.status === "queued" ? "text-zinc-500" : "text-zinc-900",
              )}
            >
              Transaction {i + 1}
            </div>
            <div className="text-xs text-zinc-500">
              {batch.status === "queued" && `${batch.accounts.length} accounts`}
              {batch.status === "sending" && "Waiting for confirmation"}
              {batch.status === "failed" && (
                <span className="break-all text-red-700">
                  {batch.error ?? "Didn't go through"}
                </span>
              )}
              {batch.status === "confirmed" && batch.signature && (
                <CopyButton
                  clipboard={batch.signature}
                  className="tabular-nums hover:text-zinc-800"
                >
                  {({ copied }) =>
                    copied
                      ? "Copied!"
                      : `Signature ${compress(batch.signature!, 6)}`
                  }
                </CopyButton>
              )}
            </div>
          </div>
          <div
            className={cn(
              "whitespace-nowrap tabular-nums",
              batch.status === "confirmed"
                ? "font-medium text-zinc-900"
                : "text-zinc-500",
              batch.status === "failed" && "line-through",
            )}
          >
            {formatSol(batch.lamports)} SOL
          </div>
        </li>
      ))}
    </ol>
  );
}
