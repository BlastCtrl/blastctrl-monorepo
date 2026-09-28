"use client";

import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CollapsibleTable } from "../_components/collapsible-table";
import { MintPanel } from "../_components/mint-panel";
import {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
} from "../_components/rent";
import { RentScheduleChart } from "../_components/rent-schedule-chart";
import type { ReclaimableAccount } from "../_components/types";
import { excessLamports } from "../_components/types";
import { MOCK_WALLET } from "../demo/mock-data";
import type { Outcome, SimStatus, WalletMode } from "./_parts/simulate";
import { OUTCOMES, WALLETS, useFakeReclaim } from "./_parts/simulate";
import { Tally } from "./_parts/tally";
import type { RewardProps, RewardStatus, Sending } from "./_parts/types";
import type { PresetId } from "./presets";
import { PRESETS, mockWallet } from "./presets";

const LAMPORTS_PER_BYTE = 5080;
const FEE_BPS = 500;
const SCAN_MS = 1000;

const DETAILS_IN = `@keyframes details-in {
  from { opacity: 0; transform: translateY(12px); }
}`;

type Phase = "idle" | "scanning" | "shown";

/** The numbers a reclaim started with, held while its transactions land. */
type Snapshot = Pick<
  RewardProps,
  "net" | "tokenAccounts" | "mints" | "transactions" | "emptyAccounts"
>;

/**
 * The results block (Tally): its arrival, and the reclaim with its payoff.
 * Mock data, a fake one-second scan, a fake wallet and chain, and a bar at
 * the bottom to switch wallet state, how the reclaim goes, and motion.
 * Nothing here sends a transaction.
 */
export default function ReclaimRentRewardDemo() {
  const [preset, setPreset] = useState<PresetId>("default");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const [forceReduced, setForceReduced] = useState(false);
  const systemReduced = useReducedMotion();
  const reduced = forceReduced || !!systemReduced;

  const [wallet, setWallet] = useState(() => mockWallet("default"));
  const { tokenAccounts, mints, atMinimum, selectedIds, reclaimedIds } = wallet;

  const [outcome, setOutcome] = useState<Outcome>("confirm");
  const [walletMode, setWalletMode] = useState<WalletMode>("one-prompt");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const sim = useFakeReclaim({
    outcome,
    wallet: walletMode,
    onConfirmed: (ids) =>
      setWallet((w) => ({
        ...w,
        reclaimedIds: new Set([...w.reclaimedIds, ...ids]),
      })),
  });

  /** Show the results again with the arrival, as if a scan just finished. */
  const reveal = (next = preset) => {
    sim.reset();
    setWallet(mockWallet(next));
    setRun((r) => r + 1);
    setPhase("shown");
  };
  const scan = () => {
    setPhase("scanning");
    window.setTimeout(() => reveal(), SCAN_MS);
  };
  const replay = () => {
    sim.reset();
    setPhase("idle");
    window.setTimeout(scan, 150);
  };
  const pickPreset = (id: PresetId) => {
    setPreset(id);
    if (phase === "shown") reveal(id);
    else setWallet(mockWallet(id));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r") replay();
      if (e.key === "m") setForceReduced((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const all = [...tokenAccounts, ...mints];
  const open = all.filter(
    (a) => !reclaimedIds.has(a.id) && excessLamports(a) > 0,
  );
  const selected = open.filter((a) => selectedIds.has(a.id));
  const reclaimed = all.filter((a) => reclaimedIds.has(a.id));
  const sum = (
    accounts: ReclaimableAccount[],
    f: (a: ReclaimableAccount) => number,
  ) => accounts.reduce((s, a) => s + f(a), 0);
  const afterFees = (accounts: ReclaimableAccount[]) => {
    const excess = sum(accounts, excessLamports);
    const txs = Math.ceil(accounts.length / ACCOUNTS_PER_TRANSACTION);
    return (
      excess -
      txs * FEE_PER_TRANSACTION -
      Math.floor((excess * FEE_BPS) / 10_000)
    );
  };

  const transactions = Math.ceil(selected.length / ACCOUNTS_PER_TRANSACTION);
  const net = afterFees(selected);
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

  // The reclaim in flight, if any, as the block needs to hear about it.
  const batches = sim.batches;
  const inFlight =
    batches?.some(
      (b) =>
        b.status === "waiting" ||
        b.status === "signing" ||
        b.status === "confirming",
    ) ?? false;
  const batchOf = new Map<string, SimStatus>();
  batches?.forEach((b) => b.ids.forEach((id) => batchOf.set(id, b.status)));
  const sending: Sending | null =
    inFlight && batches
      ? {
          step: batches.some((b) => b.status === "signing")
            ? "signing"
            : "confirming",
          transactions: batches.length,
          confirmed: batches.filter((b) => b.status === "confirmed").length,
          prompt:
            walletMode === "per-transaction" && batches.length > 1
              ? batches.findIndex((b) => b.status === "signing") + 1 ||
                undefined
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
    emptyAccounts: (status === "reclaimed" ? reclaimed : selected).filter(
      (a) => a.isEmpty,
    ).length,
  };

  const reclaim = () => {
    if (inFlight || status !== "ready") return;
    setSnapshot(now);
    const ids = selected.map((a) => a.id);
    const groups: string[][] = [];
    for (let i = 0; i < ids.length; i += ACCOUNTS_PER_TRANSACTION) {
      groups.push(ids.slice(i, i + ACCOUNTS_PER_TRANSACTION));
    }
    sim.start(groups);
  };

  const props: RewardProps = {
    status,
    coins: all
      .filter((a) => excessLamports(a) > 0 || reclaimedIds.has(a.id))
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        state: reclaimedIds.has(a.id)
          ? "confirmed"
          : batchOf.get(a.id) === "confirming"
            ? "pending"
            : selectedIds.has(a.id)
              ? "selected"
              : "unselected",
      })),
    ...(inFlight && snapshot ? snapshot : now),
    serviceFeeRate: "5%",
    networkFee: transactions * FEE_PER_TRANSACTION,
    reclaimed: afterFees(reclaimed),
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
            accounts: failedBatches.reduce((n, b) => n + b.ids.length, 0),
          }
        : null,
    rejectedAt: sim.rejectedAt,
    reveal: true,
    reduced,
    onReclaim: reclaim,
    onRescan: replay,
  };

  // The tables stay put while a reclaim is in flight; touching them after
  // one finishes clears what it had to say.
  const setSelected = (update: (next: Set<string>) => void) => {
    if (inFlight) return;
    if (batches || sim.rejectedAt !== null) sim.reset();
    setWallet((w) => {
      const next = new Set(w.selectedIds);
      update(next);
      return { ...w, selectedIds: next };
    });
  };
  const toggle = (id: string) =>
    setSelected((next) => {
      if (!next.delete(id)) next.add(id);
    });
  const toggleMany = (accounts: ReclaimableAccount[], select: boolean) =>
    setSelected((next) =>
      accounts
        .filter((a) => !reclaimedIds.has(a.id))
        .forEach((a) => (select ? next.add(a.id) : next.delete(a.id))),
    );

  const emptyCount = tokenAccounts.filter(
    (a) => a.isEmpty && !reclaimedIds.has(a.id),
  ).length;

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-lg))] bg-white pb-36 sm:rounded-lg sm:shadow-sm">
      <div className="px-4 pb-6 sm:p-6">
        <p className="mb-4 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Reward playground with mock data and a pretend wallet: nothing is
          sent. R replays the scan, M turns motion off.
        </p>
        <div className="grid items-start gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div>
            <h1 className="font-display text-3xl font-semibold">
              Reclaim excess rent
            </h1>
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
                  ) - minimumBalance(TOKEN_ACCOUNT_SIZE, LAMPORTS_PER_BYTE),
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

            {phase !== "shown" && (
              <div className="mt-6">
                <Button
                  color="indigo"
                  onClick={scan}
                  disabled={phase === "scanning"}
                >
                  {phase === "scanning" && (
                    <SpinnerIcon className="-ml-1 size-5 animate-spin" />
                  )}
                  {phase === "scanning" ? "Checking…" : "Check my accounts"}
                </Button>
              </div>
            )}
          </div>
          <RentScheduleChart lamportsPerByte={LAMPORTS_PER_BYTE} />
        </div>
      </div>

      {phase === "shown" && (
        <div key={run} className="border-t border-zinc-200 px-4 sm:px-6">
          <Tally {...props} />

          {/* The details follow the block in, quietly. */}
          <style>{DETAILS_IN}</style>
          <div
            className={cn(
              "pt-10 pb-6",
              !reduced && "[animation:details-in_350ms_ease-out_300ms_both]",
            )}
          >
            <section aria-labelledby="token-accounts-heading">
              <h3
                id="token-accounts-heading"
                className="text-sm font-semibold text-zinc-900"
              >
                Token accounts
              </h3>
              {tokenAccounts.length === 0 ? (
                <p className="mt-4 max-w-prose rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                  Every token account in this wallet is already at the minimum.
                  Rent drops again in November, so check back then.
                </p>
              ) : (
                <>
                  {emptyCount > 0 && <EmptyAccountsHint count={emptyCount} />}
                  <CollapsibleTable
                    noun="accounts"
                    accounts={tokenAccounts}
                    selectedIds={selectedIds}
                    reclaimedIds={reclaimedIds}
                    onToggle={toggle}
                    onToggleAll={(select) => toggleMany(tokenAccounts, select)}
                  />
                  {atMinimum > 0 && (
                    <p className="mt-2 ml-12 text-sm text-zinc-500">
                      {atMinimum} other{" "}
                      {atMinimum === 1 ? "account is" : "accounts are"} already
                      at the minimum.
                    </p>
                  )}
                </>
              )}
            </section>

            <section aria-labelledby="mints-heading" className="mt-8 space-y-4">
              <h3
                id="mints-heading"
                className="text-sm font-semibold text-zinc-900"
              >
                Mints
              </h3>
              <MintPanel
                owner={MOCK_WALLET}
                mints={mints}
                selectedIds={selectedIds}
                reclaimedIds={reclaimedIds}
                onAdd={(mint) =>
                  setWallet((w) => ({
                    ...w,
                    mints: [...w.mints, mint],
                    selectedIds:
                      excessLamports(mint) > 0
                        ? new Set(w.selectedIds).add(mint.id)
                        : w.selectedIds,
                  }))
                }
                onToggle={toggle}
                onToggleAll={(select) => toggleMany(mints, select)}
              />
            </section>
          </div>
        </div>
      )}

      <Controls
        preset={preset}
        onPreset={pickPreset}
        outcome={outcome}
        onOutcome={setOutcome}
        walletMode={walletMode}
        onWalletMode={setWalletMode}
        reduced={reduced}
        systemReduced={!!systemReduced}
        onReduced={() => setForceReduced((v) => !v)}
        canReplay={phase === "shown"}
        onReplay={replay}
      />
    </div>
  );
}

function Controls(p: {
  preset: PresetId;
  onPreset: (id: PresetId) => void;
  outcome: Outcome;
  onOutcome: (id: Outcome) => void;
  walletMode: WalletMode;
  onWalletMode: (id: WalletMode) => void;
  reduced: boolean;
  systemReduced: boolean;
  onReduced: () => void;
  canReplay: boolean;
  onReplay: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl border border-zinc-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm sm:rounded-full">
        <Select
          label="Wallet state"
          value={p.preset}
          options={PRESETS}
          onChange={p.onPreset}
        />
        <Select
          label="How the reclaim goes"
          value={p.outcome}
          options={OUTCOMES}
          onChange={p.onOutcome}
        />
        <Select
          label="Wallet"
          value={p.walletMode}
          options={WALLETS}
          onChange={p.onWalletMode}
        />
        <button
          type="button"
          role="switch"
          aria-checked={!p.reduced}
          disabled={p.systemReduced}
          onClick={p.onReduced}
          title={
            p.systemReduced ? "Your system asks for reduced motion" : undefined
          }
          className="rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
        >
          Motion {p.reduced ? "off" : "on"}
        </button>
        <button
          type="button"
          onClick={p.onReplay}
          disabled={!p.canReplay}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
        >
          Replay
        </button>
      </div>
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; name: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <label className="flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-full border-0 bg-zinc-100 py-1.5 pr-8 pl-3 text-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-900"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyAccountsHint({ count }: { count: number }) {
  return (
    <p className="mt-4 max-w-prose rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {count === 1
        ? "One of these accounts holds no tokens."
        : `${count} of these accounts hold no tokens.`}{" "}
      This tool only reclaims the excess. Closing an empty account returns its
      whole rent (about{" "}
      {formatSol(
        minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE),
        5,
      )}{" "}
      SOL).{" "}
      <Link
        href="/spl-token-tools/close-empty"
        className="font-medium underline underline-offset-2"
      >
        Close empty accounts →
      </Link>
    </p>
  );
}
