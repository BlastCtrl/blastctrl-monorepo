"use client";

import { notify } from "@/components/notification";
import { Button, SpinnerIcon, cn } from "@blastctrl/ui";
import Link from "next/link";
import type { CSSProperties } from "react";
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
import {
  MOCK_AT_MINIMUM,
  MOCK_MINTS,
  MOCK_TOKEN_ACCOUNTS,
  MOCK_WALLET,
} from "../demo/mock-data";
import type { RevealMode } from "./reveal.css";
import { REVEAL_CSS, REVEAL_MODES } from "./reveal.css";
import { StageAnimated } from "./stage-animated";

const LAMPORTS_PER_BYTE = 5080;
const FEE_BPS = 500;
const SCAN_MS = 1000;

type Phase = "idle" | "scanning" | "shown";

/**
 * Playground for how the results arrive after "Check my accounts". The scan
 * is simulated, the data is mock, and the picker at the bottom chooses the
 * reveal. Changing the pick replays the reveal.
 */
export default function ReclaimRentRevealDemo() {
  const [mode, setMode] = useState<RevealMode>("stagger");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set([...MOCK_TOKEN_ACCOUNTS, ...MOCK_MINTS].map((a) => a.id)),
  );
  const reclaimedIds = new Set<string>();

  const scan = () => {
    setPhase("scanning");
    window.setTimeout(() => {
      setRun((r) => r + 1);
      setPhase("shown");
    }, SCAN_MS);
  };

  const replay = () => {
    setPhase("idle");
    window.setTimeout(scan, 150);
  };

  const pick = (next: RevealMode) => {
    setMode(next);
    if (phase === "shown") replay();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= REVEAL_MODES.length) pick(REVEAL_MODES[n - 1]!.id);
      if (e.key === "r") replay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tokenAccounts = MOCK_TOKEN_ACCOUNTS;
  const mints = MOCK_MINTS;
  const selected = [...tokenAccounts, ...mints].filter((a) =>
    selectedIds.has(a.id),
  );
  const total = selected.reduce((sum, a) => sum + excessLamports(a), 0);
  const held = selected.reduce((sum, a) => sum + a.lamports, 0);
  const needed = selected.reduce((sum, a) => sum + a.minimum, 0);
  const transactions = Math.ceil(selected.length / ACCOUNTS_PER_TRANSACTION);
  const networkFee = transactions * FEE_PER_TRANSACTION;
  const serviceFee = Math.floor((total * FEE_BPS) / 10_000);
  const emptyCount = tokenAccounts.filter((a) => a.isEmpty).length;

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleMany = (accounts: ReclaimableAccount[], select: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      accounts.forEach((a) => (select ? next.add(a.id) : next.delete(a.id)));
      return next;
    });

  const current = REVEAL_MODES.find((m) => m.id === mode)!;

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-lg))] bg-white pb-28 sm:rounded-lg sm:shadow-sm">
      <style>{REVEAL_CSS}</style>
      <div className="px-4 pb-6 sm:p-6">
        <p className="mb-4 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Reveal playground with mock data. Press 1 to {REVEAL_MODES.length} to
          pick a reveal, R to replay it.
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
                SOL per token account today, and more with each step. Your
                tokens don‘t move and nothing gets closed.
              </p>
              <p>
                Accounts with excess SOL are selected by default. You can
                uncheck any that you wish to skip.
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
        <div key={run} className={`rv-${mode}`}>
          <div
            data-reveal-root
            className="border-t border-zinc-200 px-4 pt-6 sm:px-6"
          >
            <StageAnimated
              total={total}
              net={total - networkFee - serviceFee}
              serviceFee={serviceFee}
              serviceFeeRate="5%"
              networkFee={networkFee}
              held={held}
              needed={needed}
              tokenAccounts={
                selected.filter((a) => a.kind === "token-account").length
              }
              mints={selected.filter((a) => a.kind === "mint").length}
              transactions={transactions}
              onReclaim={() =>
                notify({
                  type: "info",
                  title: "Demo",
                  description: `In the real tool this opens the review dialog for ${formatSol(total, 5)} SOL.`,
                })
              }
              onRescan={replay}
            />

            <div className="pb-6">
              <section
                aria-labelledby="token-accounts-heading"
                data-reveal
                style={{ "--i": 8 } as CSSProperties}
                className="mt-10"
              >
                <h3
                  id="token-accounts-heading"
                  className="text-sm font-semibold text-zinc-900"
                >
                  Token accounts
                </h3>
                {emptyCount > 0 && <EmptyAccountsHint count={emptyCount} />}
                <CollapsibleTable
                  noun="accounts"
                  accounts={tokenAccounts}
                  selectedIds={selectedIds}
                  reclaimedIds={reclaimedIds}
                  onToggle={toggle}
                  onToggleAll={(select) => toggleMany(tokenAccounts, select)}
                />
                {MOCK_AT_MINIMUM > 0 && (
                  <p className="mt-2 ml-12 text-sm text-zinc-500">
                    {MOCK_AT_MINIMUM} other{" "}
                    {MOCK_AT_MINIMUM === 1 ? "account is" : "accounts are"}{" "}
                    already at the minimum.
                  </p>
                )}
              </section>

              <section
                aria-labelledby="mints-heading"
                data-reveal
                style={{ "--i": 10 } as CSSProperties}
                className="mt-8 space-y-4"
              >
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
                  onAdd={() => {}}
                  onToggle={toggle}
                  onToggleAll={(select) => toggleMany(mints, select)}
                />
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div
          role="radiogroup"
          aria-label="Reveal style"
          className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm"
        >
          {REVEAL_MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === mode}
              onClick={() => pick(m.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                m.id === mode
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100",
              )}
            >
              <span className="mr-1.5 text-xs tabular-nums opacity-60">
                {i + 1}
              </span>
              {m.name}
            </button>
          ))}
          <button
            type="button"
            onClick={replay}
            disabled={phase !== "shown"}
            className="ml-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
          >
            Replay
          </button>
        </div>
        <p className="rounded-full bg-white/90 px-3 py-1 text-xs text-zinc-500 shadow-sm">
          {current.keys}
        </p>
      </div>
    </div>
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
