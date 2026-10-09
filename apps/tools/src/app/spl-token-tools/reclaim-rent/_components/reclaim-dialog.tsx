import { notify } from "@/components/notification";
import { compress } from "@/lib/solana/common";
import { Button, CopyButton, SpinnerIcon, cn } from "@blastctrl/ui";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { SERVICE_FEE, serviceFeeLamports } from "./fee";
import {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
  formatSol,
  remainingSteps,
} from "./rent";
import type { ReclaimableAccount } from "./types";
import { closes, excessLamports, feeBase, reclaimLamports } from "./types";
import { WalletRefusedError, useReclaimExcess } from "./use-reclaim-excess";
import { useRentRate } from "./use-rent-rate";

type Batch = {
  accounts: ReclaimableAccount[];
  /**
   * What the batch returns before any fees: the excess rent, plus the whole
   * deposit of the accounts it closes.
   */
  lamports: number;
  /** Service fee for the batch. */
  fee: number;
  status: "queued" | "sending" | "confirmed" | "failed";
  signature?: string;
  error?: string;
};

type Phase = "review" | "signing" | "sending" | "done";

/** How long the panel takes to leave; the parent unmounts it after that. */
const LEAVE_MS = 150;

type Props = {
  accounts: ReclaimableAccount[];
  /** Close the empty token accounts instead of withdrawing their excess. */
  closeEmpty: boolean;
  onConfirmed: (ids: string[]) => void;
  onSettled?: () => void;
  onClose: () => void;
};

/** What a batch puts in the wallet: after its service and network fees. */
const afterFees = (batch: Batch) =>
  batch.lamports - batch.fee - FEE_PER_TRANSACTION;

function toBatches(
  accounts: ReclaimableAccount[],
  closeEmpty: boolean,
): Batch[] {
  const batches: Batch[] = [];
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_TRANSACTION) {
    const slice = accounts.slice(i, i + ACCOUNTS_PER_TRANSACTION);
    const lamports = slice.reduce(
      (sum, a) => sum + reclaimLamports(a, closeEmpty),
      0,
    );
    batches.push({
      accounts: slice,
      lamports,
      fee: serviceFeeLamports(feeBase(slice)),
      status: "queued",
    });
  }
  return batches;
}

export function ReclaimDialog({
  accounts,
  closeEmpty,
  onConfirmed,
  onSettled,
  onClose,
}: Props) {
  const { publicKey } = useWallet();
  const stepsLeft = remainingSteps(useRentRate().lamportsPerByte);
  const [phase, setPhase] = useState<Phase>("review");
  const [batches, setBatches] = useState(() => toBatches(accounts, closeEmpty));
  const [signingCount, setSigningCount] = useState(0);
  // Closing plays the leave first: the parent only unmounts on `onClose`.
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    window.setTimeout(onClose, LEAVE_MS);
  };

  const total = batches.reduce((sum, b) => sum + b.lamports, 0);
  const fees =
    batches.length * FEE_PER_TRANSACTION +
    batches.reduce((sum, b) => sum + b.fee, 0);
  const net = total - fees;
  const confirmed = batches.filter((b) => b.status === "confirmed");
  const failed = batches.filter((b) => b.status === "failed");
  const reclaimed = confirmed.reduce((sum, b) => sum + afterFees(b), 0);
  const busy = phase === "signing" || phase === "sending";
  const closing = accounts.filter((a) => closes(a, closeEmpty)).length;

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
        closeEmpty,
      });
      setPhase("done");
    } catch (err) {
      if (err instanceof WalletRefusedError && err.sent > 0) {
        // The wallet stopped partway. What went out has reported; the rest
        // are marked so "Send failed ones again" picks them up.
        setBatches((prev) =>
          prev.map((b) =>
            b.status === "sending"
              ? { ...b, status: "failed", error: "Cancelled in your wallet" }
              : b,
          ),
        );
        setPhase("done");
        return;
      }
      // Nothing was sent (usually the wallet rejected signing). Only what
      // was waiting goes back to the queue; nothing confirmed is ever sent
      // again.
      setBatches((prev) =>
        prev.map((b) =>
          b.status === "sending" ? { ...b, status: "queued" } : b,
        ),
      );
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
    if (phase === "review") return `Reclaim ${formatSol(net)} SOL`;
    if (phase === "signing") {
      return signingCount === 1
        ? "Approve the transaction in your wallet"
        : `Approve ${signingCount} transactions in your wallet`;
    }
    if (phase === "sending") return "Reclaiming";
    if (failed.length > 0) {
      return `Reclaimed ${formatSol(reclaimed)} of ${formatSol(net)} SOL`;
    }
    return `Reclaimed ${formatSol(reclaimed)} SOL`;
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : close}>
      <DialogBackdrop
        transition
        className="fixed inset-0 z-50 bg-black/30 transition duration-150 ease-out data-closed:opacity-0"
      />
      <div className="fixed inset-0 z-50 flex w-screen items-center justify-center p-4">
        {/* A modal: it scales in place, from the centre. */}
        <DialogPanel
          transition
          className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-lg transition ease-[cubic-bezier(0.23,1,0.32,1)] data-closed:scale-[0.97] data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
        >
          <DialogTitle
            aria-live="polite"
            className="flex items-center gap-3 px-6 pt-6 font-display text-xl font-semibold"
          >
            {phase === "signing" && (
              <SpinnerIcon className="size-5 shrink-0 animate-spin text-indigo-600" />
            )}
            {title()}
          </DialogTitle>

          <div className="overflow-y-auto px-6 pt-4 pb-2">
            {phase === "review" ? (
              <Review
                accounts={accounts}
                closeEmpty={closeEmpty}
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
                  ` Rent drops ${stepsLeft === 1 ? "once more" : `${stepsLeft} more times`}, expected in November. After each drop, ${closing > 0 ? "the accounts still open" : "the same accounts"} will have more to reclaim.`}
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

          <div className="flex flex-wrap justify-end gap-3 px-6 pt-4 pb-6">
            {phase === "review" && (
              <>
                <Button plain onClick={close}>
                  Cancel
                </Button>
                <Button
                  color="indigo"
                  disabled={net <= 0}
                  onClick={() => run(batches.map((_, i) => i))}
                >
                  Reclaim {formatSol(net)} SOL
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
                <Button color="indigo" onClick={close}>
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
  closeEmpty,
  batches,
  wallet,
}: {
  accounts: ReclaimableAccount[];
  closeEmpty: boolean;
  batches: Batch[];
  wallet: string;
}) {
  const total = batches.reduce((sum, b) => sum + b.lamports, 0);
  const networkFees = batches.length * FEE_PER_TRANSACTION;
  const serviceFee = batches.reduce((sum, b) => sum + b.fee, 0);
  const net = total - networkFees - serviceFee;
  const mints = accounts.filter((a) => a.kind === "mint").length;
  const tokenAccounts = accounts.length - mints;
  const closing = accounts.filter((a) => closes(a, closeEmpty));
  const deposits = closing.reduce((sum, a) => sum + a.lamports, 0);
  const excess = accounts
    .filter((a) => !closes(a, closeEmpty))
    .reduce((sum, a) => sum + excessLamports(a), 0);
  const staying = accounts.length - closing.length;

  return (
    <>
      <p className="text-sm text-zinc-600">
        {whatHappens(closing.length, staying)}
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
        {staying > 0 && <Row label="Excess rent">{formatSol(excess)} SOL</Row>}
        {closing.length > 0 && (
          <Row
            label={`Deposits, ${closing.length} closed ${closing.length === 1 ? "account" : "accounts"}`}
          >
            {formatSol(deposits)} SOL
          </Row>
        )}
        <Row
          label={`Network fees, ${batches.length} ${batches.length === 1 ? "transaction" : "transactions"}`}
        >
          −{formatSol(networkFees)} SOL
        </Row>
        {SERVICE_FEE && (
          <Row label="Service fee">−{formatSol(serviceFee)} SOL</Row>
        )}
        <Row label="You receive" strong>
          {formatSol(net)} SOL
        </Row>
      </dl>
      {net <= 0 && (
        <p className="mt-3 text-sm text-red-700">
          The fees would be more than the excess rent in these accounts, so
          there is nothing to gain from reclaiming them.
        </p>
      )}
      {batches.length > 1 && (
        <p className="mt-3 text-xs text-zinc-500">
          One transaction fits {ACCOUNTS_PER_TRANSACTION} accounts. Your wallet
          asks you to approve all {batches.length} at once.
        </p>
      )}
    </>
  );
}

/** What the reclaim does to the accounts, before the numbers. */
function whatHappens(closing: number, staying: number) {
  const closed =
    closing === 1
      ? "The empty token account is closed and its whole deposit goes to your wallet."
      : `The ${closing} empty token accounts are closed and their whole deposit goes to your wallet.`;
  if (closing === 0) {
    return "Your tokens stay where they are and no account is closed. Each account keeps exactly the rent it needs today, and the rest goes to your wallet.";
  }
  if (staying === 0) return closed;
  return `Your tokens stay where they are. ${closed} ${
    staying === 1
      ? "The other account stays open with exactly the rent it needs today, and the rest goes to your wallet."
      : `The other ${staying} stay open with exactly the rent they need today, and the rest goes to your wallet.`
  }`;
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
            {formatSol(afterFees(batch))} SOL
          </div>
        </li>
      ))}
    </ol>
  );
}
