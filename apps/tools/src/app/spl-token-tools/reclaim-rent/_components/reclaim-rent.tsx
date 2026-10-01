import { notify } from "@/components/notification";
import { chunk } from "@/lib/utils";
import { useReclaimableAccounts } from "@/state/queries/use-reclaimable-accounts";
import { Button, Switch, cn } from "@blastctrl/ui";
import { Description, Field, Label } from "@headlessui/react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { CollapsibleTable } from "./collapsible-table";
import { SERVICE_FEE, formatFeeRate, serviceFeeLamports } from "./fee";
import { MintPanel } from "./mint-panel";
import { ReclaimDialog } from "./reclaim-dialog";
import {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
  remainingSteps,
} from "./rent";
import { RentScheduleChart } from "./rent-schedule-chart";
import { SoundToggle } from "./results/sound-toggle";
import { Stage } from "./results/stage";
import { Tally } from "./results/tally";
import type {
  CoinState,
  RewardProps,
  RewardStatus,
  Sending,
} from "./results/types";
import type { ReclaimableAccount } from "./types";
import { closes, excessLamports, reclaimLamports } from "./types";
import { WalletRefusedError, useReclaimExcess } from "./use-reclaim-excess";
import { useRentRate } from "./use-rent-rate";

/**
 * A scan always takes at least this long, so the stage's drifting dots read
 * as work and the results never arrive with a stutter.
 */
const SCAN_MIN_MS = 1500;

const DETAILS_ID = "reclaim-details";

type Phase = "idle" | "scanning" | "shown";

type BatchStatus =
  "waiting" | "signing" | "confirming" | "confirmed" | "failed";
type Batch = { accounts: ReclaimableAccount[]; status: BatchStatus };

/** The numbers a reclaim started with, held while its transactions land. */
type Snapshot = Pick<
  RewardProps,
  "net" | "tokenAccounts" | "mints" | "transactions" | "emptyAccounts"
>;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** What one transaction's accounts put in the wallet, after its fees. */
const afterFees = (accounts: ReclaimableAccount[], closeEmpty: boolean) => {
  const lamports = accounts.reduce(
    (sum, a) => sum + reclaimLamports(a, closeEmpty),
    0,
  );
  return lamports - serviceFeeLamports(lamports) - FEE_PER_TRANSACTION;
};

/**
 * The whole tool: the intro, the stage with the results block, and the
 * drawer below it. It talks to the chain only through the wallet adapter's
 * connection and wallet, which the demo page swaps for mock ones.
 */
export function ReclaimRent({
  forceReducedMotion = false,
}: {
  /** Skip every animation even when the system allows them (the demo). */
  forceReducedMotion?: boolean;
}) {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const { lamportsPerByte } = useRentRate();
  const stepsLeft = remainingSteps(lamportsPerByte);
  const { data, error, refetch } = useReclaimableAccounts(
    publicKey?.toBase58() ?? "",
  );
  const reduced = !!useReducedMotion() || forceReducedMotion;

  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [closeEmpty, setCloseEmpty] = useState(true);
  const [addedMints, setAddedMints] = useState<ReclaimableAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [reclaimedIds, setReclaimedIds] = useState(new Set<string>());
  /**
   * Accounts a reclaim closed, as they were. The refetch after it no longer
   * finds them, but they still count as reclaimed.
   */
  const [closedAccounts, setClosedAccounts] = useState<ReclaimableAccount[]>(
    [],
  );
  /** What reclaims have put in the wallet since the last scan, in lamports. */
  const [reclaimedLamports, setReclaimedLamports] = useState(0);
  const [checkout, setCheckout] = useState<ReclaimableAccount[] | null>(null);
  // A reclaim sent from the results block, rather than the review dialog.
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  /**
   * The wallet's last refusal: `count` goes up each time, so the pill shakes
   * again, and `sent` says how many transactions went out before it.
   */
  const [refusal, setRefusal] = useState<{
    count: number;
    sent: number;
    of: number;
  } | null>(null);
  const sent = useRef({
    groups: [] as ReclaimableAccount[][],
    closeEmpty: false,
  });

  // Selection and results belong to one wallet on one network. Start over
  // when either changes: a wallet's token accounts have the same addresses
  // on every cluster, so a reclaimed set from mainnet must not leak to devnet.
  const owner = publicKey?.toBase58() ?? "";
  const scope = `${owner} ${connection.rpcEndpoint}`;
  const [stateScope, setStateScope] = useState(scope);
  if (stateScope !== scope) {
    setStateScope(scope);
    setPhase("idle");
    setAddedMints([]);
    setSelectedIds(new Set());
    setReclaimedIds(new Set());
    setClosedAccounts([]);
    setReclaimedLamports(0);
    setCheckout(null);
    setBatches(null);
    setRefusal(null);
  }

  /** What reclaiming an account returns, with the switch as it is now. */
  const worth = (a: ReclaimableAccount) => reclaimLamports(a, closeEmpty);
  const fetched = (data ?? []).filter((a) => a.kind === "token-account");
  const fetchedIds = new Set(fetched.map((a) => a.id));
  const scanned = [
    ...fetched,
    ...closedAccounts.filter((a) => !fetchedIds.has(a.id)),
  ];
  const tokenAccounts = scanned
    .filter((a) => a.blockedReason || worth(a) > 0 || reclaimedIds.has(a.id))
    .sort(
      (a, b) =>
        Number(!!a.blockedReason) - Number(!!b.blockedReason) ||
        worth(b) - worth(a),
    )
    // Finished accounts sink below the ones that still have excess.
    .sort(
      (a, b) => Number(reclaimedIds.has(a.id)) - Number(reclaimedIds.has(b.id)),
    );
  const atMinimum = scanned.length - tokenAccounts.length;
  const mints = [
    ...(data ?? []).filter((a) => a.kind === "mint"),
    ...addedMints,
  ];
  const all = [...tokenAccounts, ...mints];

  const isOpen = (a: ReclaimableAccount) =>
    !a.blockedReason && !reclaimedIds.has(a.id) && worth(a) > 0;
  const open = all.filter(isOpen);
  const selected = open.filter((a) => selectedIds.has(a.id));
  const reclaimed = all.filter((a) => reclaimedIds.has(a.id));
  const selectedLamports = selected.reduce((sum, a) => sum + worth(a), 0);
  const transactions = Math.ceil(selected.length / ACCOUNTS_PER_TRANSACTION);
  const serviceFee = serviceFeeLamports(selectedLamports);
  const networkFee = transactions * FEE_PER_TRANSACTION;
  const net = selectedLamports - serviceFee - networkFee;
  // Whatever the switch says, so its description can say what it would do.
  const emptyCount = scanned.filter(
    (a) => !reclaimedIds.has(a.id) && closes(a, true),
  ).length;

  const status: RewardStatus =
    open.length === 0
      ? reclaimed.length > 0
        ? "reclaimed"
        : "nothing"
      : selected.length === 0
        ? "none-selected"
        : net <= 0
          ? "fees-exceed"
          : "ready";

  // A reclaim from the results block, as the block needs to hear about it.
  const inFlight =
    batches?.some(
      (b) =>
        b.status === "waiting" ||
        b.status === "signing" ||
        b.status === "confirming",
    ) ?? false;
  const batchOf = new Map<string, BatchStatus>();
  batches?.forEach((b) =>
    b.accounts.forEach((a) => batchOf.set(a.id, b.status)),
  );
  const signing = batches?.filter((b) => b.status === "signing") ?? [];
  const sending: Sending | null =
    inFlight && batches
      ? {
          step: signing.length > 0 ? "signing" : "confirming",
          transactions: batches.length,
          confirmed: batches.filter((b) => b.status === "confirmed").length,
          // A wallet that asks once per transaction signs them one by one.
          prompt:
            batches.length > 1 && signing.length === 1
              ? batches.findIndex((b) => b.status === "signing") + 1
              : undefined,
        }
      : null;
  const failedBatches =
    !inFlight && batches ? batches.filter((b) => b.status === "failed") : [];

  const now: Snapshot = {
    net,
    tokenAccounts: selected.filter((a) => a.kind === "token-account").length,
    mints: selected.filter((a) => a.kind === "mint").length,
    transactions,
    emptyAccounts:
      status === "reclaimed"
        ? closedAccounts.length
        : selected.filter((a) => closes(a, closeEmpty)).length,
  };

  /** Accounts a transaction confirmed: done, and their SOL counted. */
  const markReclaimed = (
    accounts: ReclaimableAccount[],
    closeEmpty: boolean,
  ) => {
    setReclaimedIds((prev) => new Set([...prev, ...accounts.map((a) => a.id)]));
    setClosedAccounts((prev) => [
      ...prev,
      ...accounts.filter((a) => closes(a, closeEmpty)),
    ]);
    setReclaimedLamports((prev) => prev + afterFees(accounts, closeEmpty));
  };

  const afterReclaim = () => {
    void refetch();
    void queryClient.invalidateQueries({
      queryKey: ["sol-balance", publicKey?.toString()],
    });
  };

  const markBatch = (index: number, status: BatchStatus) =>
    setBatches((prev) =>
      prev ? prev.map((b, i) => (i === index ? { ...b, status } : b)) : prev,
    );

  const reclaim = useReclaimExcess({
    onStage: markBatch,
    onBatchResult: (result) => {
      markBatch(result.index, result.status);
      if (result.status === "confirmed") {
        markReclaimed(
          sent.current.groups[result.index] ?? [],
          sent.current.closeEmpty,
        );
      }
    },
    onSettled: afterReclaim,
  });

  /** The pill on the results block: send everything selected, right away. */
  const reclaimNow = async () => {
    if (inFlight || status !== "ready") return;
    const groups = chunk(selected, ACCOUNTS_PER_TRANSACTION);
    sent.current = { groups, closeEmpty };
    setSnapshot(now);
    setRefusal(null);
    setBatches(groups.map((accounts) => ({ accounts, status: "waiting" })));
    try {
      await reclaim.mutateAsync({
        batches: groups.map((accounts, index) => ({ index, accounts })),
        closeEmpty,
      });
    } catch (err) {
      // The wallet said no, maybe partway through; whatever went out before
      // has been counted. Anything else means nothing was sent.
      setBatches(null);
      if (err instanceof WalletRefusedError) {
        const { sent, of } = err;
        setRefusal((prev) => ({ count: (prev?.count ?? 0) + 1, sent, of }));
      } else {
        notify({
          type: "error",
          title: "Nothing was sent",
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const scan = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    setPhase("scanning");
    setReclaimedIds(new Set());
    setClosedAccounts([]);
    setReclaimedLamports(0);
    setAddedMints([]);
    setBatches(null);
    setRefusal(null);
    const [{ data, isError }] = await Promise.all([
      refetch(),
      wait(SCAN_MIN_MS),
    ]);
    // A failed scan keeps the last results in the cache; don't show them as
    // if they were new.
    if (isError || !data) {
      setPhase("idle");
      return;
    }
    // Empty accounts too, so turning closing on finds them ticked.
    setSelectedIds(
      new Set(
        data
          .filter((a) => excessLamports(a) > 0 || closes(a, true))
          .map((a) => a.id),
      ),
    );
    setRun((r) => r + 1);
    setPhase("shown");
  };

  // The tables and the switch stay put while a reclaim from the block is in
  // flight; touching them after one finishes clears what it had to say.
  const unlocked = () => {
    if (inFlight) return false;
    if (batches || refusal) {
      setBatches(null);
      setRefusal(null);
    }
    return true;
  };
  const changeCloseEmpty = (close: boolean) => {
    if (unlocked()) setCloseEmpty(close);
  };
  const setSelection = (update: (next: Set<string>) => void) => {
    if (!unlocked()) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      update(next);
      return next;
    });
  };
  const toggle = (id: string) =>
    setSelection((next) => {
      if (!next.delete(id)) next.add(id);
    });
  const toggleMany = (accounts: ReclaimableAccount[], select: boolean) =>
    setSelection((next) =>
      accounts
        .filter((a) => !a.blockedReason && !reclaimedIds.has(a.id))
        .forEach((a) => (select ? next.add(a.id) : next.delete(a.id))),
    );

  const props: RewardProps = {
    status,
    coins: all
      .filter(
        (a) => !a.blockedReason && (worth(a) > 0 || reclaimedIds.has(a.id)),
      )
      .map((a) => {
        const state: CoinState = reclaimedIds.has(a.id)
          ? "confirmed"
          : batchOf.get(a.id) === "confirming"
            ? "pending"
            : selectedIds.has(a.id)
              ? "selected"
              : "unselected";
        return { id: a.id, kind: a.kind, state };
      }),
    ...(inFlight && snapshot ? snapshot : now),
    serviceFeeRate: SERVICE_FEE ? formatFeeRate(SERVICE_FEE) : "0%",
    networkFee,
    reclaimed: reclaimedLamports,
    reclaimedFrom: {
      tokenAccounts: reclaimed.filter((a) => a.kind === "token-account").length,
      mints: reclaimed.filter((a) => a.kind === "mint").length,
    },
    sending,
    failed:
      failedBatches.length > 0
        ? {
            transactions: failedBatches.length,
            of: batches!.length,
            accounts: failedBatches.reduce((n, b) => n + b.accounts.length, 0),
          }
        : null,
    rejectedAt: refusal?.count ?? null,
    cancelledAfter:
      refusal && refusal.sent > 0
        ? { transactions: refusal.sent, of: refusal.of }
        : null,
    reveal: true,
    reduced,
    detailsId: DETAILS_ID,
    detailsOpen,
    onToggleDetails: () => setDetailsOpen((o) => !o),
    onReclaim: () => void reclaimNow(),
    onRescan: () => void scan(),
  };

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-lg))] bg-white sm:rounded-lg sm:shadow-sm">
      <div className="px-4 pb-6 sm:p-6">
        <div className="grid items-start gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="font-display text-3xl font-semibold">
                Reclaim excess rent
              </h1>
              <SoundToggle className="mt-1 md:hidden" />
            </div>
            <div className="mt-4 max-w-prose space-y-2 text-pretty text-gray-500">
              <p>
                Every account on Solana holds a SOL deposit (rent), and the
                required rent is{" "}
                <a
                  href="https://solana.com/upgrades/reduced-rent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  being lowered in five steps
                </a>
                . Token accounts and mints you created earlier still hold the
                old, larger amount.
              </p>
              <p>
                This tool sends the difference back to your wallet: about{" "}
                {formatSol(
                  minimumBalance(
                    TOKEN_ACCOUNT_SIZE,
                    ORIGINAL_LAMPORTS_PER_BYTE,
                  ) - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte),
                  5,
                )}{" "}
                SOL per token account today, and more with each step.
              </p>
              <p>
                Your tokens stay where they are. Below the reclaim button, you
                can pick exactly which accounts to reclaim from, and whether
                empty ones get closed.
              </p>
            </div>

            {/* The button goes the moment it's clicked (the stage below says
                "Checking…"), but its space stays so nothing jumps. */}
            <div
              className={cn("mt-6", phase !== "idle" && "invisible")}
              aria-hidden={phase !== "idle" || undefined}
              inert={phase !== "idle"}
            >
              <Button color="indigo" onClick={() => void scan()}>
                {connected ? "Check my accounts" : "Connect your wallet"}
              </Button>
              {error && phase === "idle" && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  Couldn&apos;t load your token accounts. Try again in a moment.
                </p>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 hidden justify-end md:flex">
              <SoundToggle />
            </div>
            <RentScheduleChart lamportsPerByte={lamportsPerByte} />
          </div>
        </div>
      </div>

      {phase !== "idle" && (
        <div className="border-t border-zinc-200 px-4 sm:px-6">
          {/* The stage is there from the click: its dots drift while the
              scan runs, settle when it's done, and the results arrive on
              it. */}
          <Stage
            moving={phase === "scanning"}
            last={phase !== "shown" || !detailsOpen}
            reduced={reduced}
          >
            {phase === "shown" && <Tally key={run} {...props} />}
          </Stage>

          {/* The detailed view: closed by default, it opens downwards like a
              drawer from "Customize" on the stage. Closed, it's out of
              the tab order and hidden from screen readers. */}
          {phase === "shown" && (
            <div
              id={DETAILS_ID}
              inert={!detailsOpen}
              className={cn(
                "grid",
                detailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                !reduced &&
                  "transition-[grid-template-rows] duration-300 ease-out",
              )}
            >
              {/* Room either side so focus rings aren't clipped. */}
              <div className="-mx-2 min-h-0 overflow-hidden px-2">
                <div
                  className={cn(
                    "pt-10 pb-6",
                    !detailsOpen && "-translate-y-3 opacity-0",
                    !reduced &&
                      "transition-[opacity,translate] duration-300 ease-out",
                  )}
                >
                  <Details
                    tokenAccounts={tokenAccounts}
                    scannedCount={scanned.length}
                    atMinimum={atMinimum}
                    stepsLeft={stepsLeft}
                    mints={mints}
                    owner={owner}
                    selectedIds={selectedIds}
                    reclaimedIds={reclaimedIds}
                    closedIds={new Set(closedAccounts.map((a) => a.id))}
                    emptyCount={emptyCount}
                    closeEmpty={closeEmpty}
                    onCloseEmpty={changeCloseEmpty}
                    onToggle={toggle}
                    onToggleMany={toggleMany}
                    onAddMint={(mint) => {
                      setAddedMints((prev) => [...prev, mint]);
                      if (excessLamports(mint) > 0) {
                        setSelection((next) => next.add(mint.id));
                      }
                    }}
                    selected={selected}
                    selectedLamports={selectedLamports}
                    transactions={transactions}
                    serviceFee={serviceFee}
                    busy={inFlight}
                    onReview={() => setCheckout(selected)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {checkout && (
        <ReclaimDialog
          accounts={checkout}
          // The dialog is modal, so the switch can't change under it.
          closeEmpty={closeEmpty}
          onConfirmed={(ids) =>
            markReclaimed(
              checkout.filter((a) => ids.includes(a.id)),
              closeEmpty,
            )
          }
          onSettled={afterReclaim}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}

/**
 * Everything the results block leaves out: whether empty accounts get
 * closed, which token accounts and mints to reclaim from, adding a mint, and
 * the old way to send, through the review dialog.
 */
function Details(p: {
  tokenAccounts: ReclaimableAccount[];
  scannedCount: number;
  atMinimum: number;
  stepsLeft: number;
  mints: ReclaimableAccount[];
  owner: string;
  selectedIds: Set<string>;
  reclaimedIds: Set<string>;
  closedIds: Set<string>;
  emptyCount: number;
  closeEmpty: boolean;
  onCloseEmpty: (close: boolean) => void;
  onToggle: (id: string) => void;
  onToggleMany: (accounts: ReclaimableAccount[], select: boolean) => void;
  onAddMint: (mint: ReclaimableAccount) => void;
  selected: ReclaimableAccount[];
  selectedLamports: number;
  transactions: number;
  serviceFee: number;
  busy: boolean;
  onReview: () => void;
}) {
  return (
    <>
      {/* The heading labels the switch beside it, and the line under it
          describes it. Headless UI's Field wires both up; plain aria
          attributes on the Switch get overwritten. */}
      <Field as="section" aria-labelledby="close-empty-heading">
        <div className="flex items-center gap-3">
          <Label
            as="h3"
            id="close-empty-heading"
            className="text-sm font-semibold text-zinc-900"
          >
            Close empty accounts
          </Label>
          <Switch
            color="indigo"
            checked={p.closeEmpty}
            disabled={p.busy}
            onChange={p.onCloseEmpty}
          />
        </div>
        <Description as="p" className="mt-2 max-w-prose text-sm text-zinc-500">
          {p.emptyCount === 0
            ? "No empty token accounts found."
            : p.emptyCount === 1
              ? "1 empty token account found. Closing it reclaims the full rent."
              : `${p.emptyCount} empty token accounts found. Closing them reclaims the full rent.`}
        </Description>
      </Field>

      <section aria-labelledby="token-accounts-heading" className="mt-8">
        <h3
          id="token-accounts-heading"
          className="text-sm font-semibold text-zinc-900"
        >
          Token accounts
        </h3>
        {p.tokenAccounts.length === 0 ? (
          <p className="mt-4 max-w-prose rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
            {p.scannedCount === 0
              ? "This wallet has no token accounts."
              : "Every token account in this wallet is already at the minimum."}
            {p.scannedCount > 0 &&
              p.stepsLeft > 0 &&
              " Rent drops again in November, so check back then."}
          </p>
        ) : (
          <>
            <CollapsibleTable
              noun="accounts"
              accounts={p.tokenAccounts}
              selectedIds={p.selectedIds}
              reclaimedIds={p.reclaimedIds}
              closedIds={p.closedIds}
              closeEmpty={p.closeEmpty}
              onToggle={p.onToggle}
              onToggleAll={(select) => p.onToggleMany(p.tokenAccounts, select)}
            />
            {p.atMinimum > 0 && (
              <p className="mt-2 ml-12 text-sm text-zinc-500">
                {p.atMinimum} other{" "}
                {p.atMinimum === 1 ? "account is" : "accounts are"} already at
                the minimum.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="mints-heading" className="mt-8 space-y-4">
        <h3 id="mints-heading" className="text-sm font-semibold text-zinc-900">
          Mints
        </h3>
        <MintPanel
          owner={p.owner}
          mints={p.mints}
          selectedIds={p.selectedIds}
          reclaimedIds={p.reclaimedIds}
          onAdd={p.onAddMint}
          onToggle={p.onToggle}
          onToggleAll={(select) => p.onToggleMany(p.mints, select)}
        />
      </section>

      {/* The old way to send: review everything first in a dialog, then
          watch the transactions confirm there. */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-zinc-200 pt-6">
        <div aria-live="polite">
          <div className="text-base font-medium text-zinc-900 tabular-nums">
            {formatSol(p.selectedLamports, 5)} SOL selected
          </div>
          <div className="text-sm text-zinc-500">
            {p.selected.length === 0
              ? "Select at least one account"
              : `${p.selected.length} ${p.selected.length === 1 ? "account" : "accounts"}, ${p.transactions} ${p.transactions === 1 ? "transaction" : "transactions"}`}
          </div>
        </div>
        <Button
          color="indigo"
          disabled={p.selected.length === 0 || p.busy}
          onClick={p.onReview}
        >
          Review and reclaim
        </Button>
      </div>
    </>
  );
}
