"use client";

import { notify } from "@/components/notification";
import { cn } from "@blastctrl/ui";
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
import {
  MOCK_AT_MINIMUM,
  MOCK_MINTS,
  MOCK_TOKEN_ACCOUNTS,
  MOCK_WALLET,
} from "./mock-data";
import { VARIANTS } from "./_variants";

const LAMPORTS_PER_BYTE = 5080;
const FEE_BPS = 500;

/**
 * Design playground for the results state of the reclaim-rent tool. Same
 * header and tables as the real page, mock data, and a picker for the block
 * that invites the person to reclaim. Nothing here sends a transaction.
 */
export default function ReclaimRentDemo() {
  const [variantIndex, setVariantIndex] = useState(0);
  const [addedMints, setAddedMints] = useState<ReclaimableAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set([...MOCK_TOKEN_ACCOUNTS, ...MOCK_MINTS].map((a) => a.id)),
  );
  const reclaimedIds = new Set<string>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VARIANTS.length) setVariantIndex(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tokenAccounts = MOCK_TOKEN_ACCOUNTS;
  const mints = [...MOCK_MINTS, ...addedMints];
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

  const { Component: Variant, detailsOnSheet } = VARIANTS[variantIndex]!;

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-lg))] bg-white pb-24 sm:rounded-lg sm:shadow-sm">
      <div className="px-4 pb-6 sm:p-6">
        <p className="mb-4 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Demo with mock data. The reclaim button only shows a toast. Press 1 or
          2 to switch designs.
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
          </div>
          <RentScheduleChart lamportsPerByte={LAMPORTS_PER_BYTE} />
        </div>
      </div>

      <div className="border-t border-zinc-200 px-4 pt-6 sm:px-6">
        <Variant
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
          onRescan={() =>
            notify({ type: "info", title: "Demo", description: "Rescanned." })
          }
        />

        <div
          className={cn(
            "pb-6",
            detailsOnSheet
              ? "-mx-4 mt-8 rounded-b-lg border-t border-zinc-200 bg-zinc-50 px-4 pt-6 sm:-mx-6 sm:px-6"
              : "mt-10",
          )}
        >
          <section aria-labelledby="token-accounts-heading">
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
                {MOCK_AT_MINIMUM === 1 ? "account is" : "accounts are"} already
                at the minimum.
              </p>
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
              onAdd={(mint) => {
                setAddedMints((prev) => [...prev, mint]);
                if (excessLamports(mint) > 0) {
                  setSelectedIds((prev) => new Set(prev).add(mint.id));
                }
              }}
              onToggle={toggle}
              onToggleAll={(select) => toggleMany(mints, select)}
            />
          </section>
        </div>
      </div>

      <Picker index={variantIndex} onChange={setVariantIndex} />
    </div>
  );
}

function Picker({
  index,
  onChange,
}: {
  index: number;
  onChange: (index: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Design variant"
      className="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm"
    >
      {VARIANTS.map((v, i) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={i === index}
          onClick={() => onChange(i)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
            i === index
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100",
          )}
        >
          <span className="mr-1.5 text-xs tabular-nums opacity-60">
            {i + 1}
          </span>
          {v.name}
        </button>
      ))}
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
