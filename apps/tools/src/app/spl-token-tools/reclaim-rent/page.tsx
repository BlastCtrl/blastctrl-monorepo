"use client";

import { useReclaimableAccounts } from "@/state/queries/use-reclaimable-accounts";
import { useQueryClient } from "@tanstack/react-query";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useState } from "react";
import { CollapsibleTable } from "./_components/collapsible-table";
import { SERVICE_FEE, serviceFeeLamports } from "./_components/fee";
import { MintPanel } from "./_components/mint-panel";
import { ReclaimDialog } from "./_components/reclaim-dialog";
import {
  ACCOUNTS_PER_TRANSACTION,
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
  remainingSteps,
} from "./_components/rent";
import { RentScheduleChart } from "./_components/rent-schedule-chart";
import type { ReclaimableAccount } from "./_components/types";
import { excessLamports } from "./_components/types";
import { useRentRate } from "./_components/use-rent-rate";

const byExcess = (a: ReclaimableAccount, b: ReclaimableAccount) =>
  Number(!!a.blockedReason) - Number(!!b.blockedReason) ||
  excessLamports(b) - excessLamports(a);

export default function ReclaimRent() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const { lamportsPerByte } = useRentRate();
  const stepsLeft = remainingSteps(lamportsPerByte);
  const { data, isFetching, error, refetch } = useReclaimableAccounts(
    publicKey?.toBase58() ?? "",
  );
  const [addedMints, setAddedMints] = useState<ReclaimableAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [reclaimedIds, setReclaimedIds] = useState(new Set<string>());
  const [checkout, setCheckout] = useState<ReclaimableAccount[] | null>(null);

  // Selection and results belong to one wallet on one network. Start over
  // when either changes: a wallet's token accounts have the same addresses
  // on every cluster, so a reclaimed set from mainnet must not leak to devnet.
  const owner = publicKey?.toBase58() ?? "";
  const scope = `${owner} ${connection.rpcEndpoint}`;
  const [stateScope, setStateScope] = useState(scope);
  if (stateScope !== scope) {
    setStateScope(scope);
    setAddedMints([]);
    setSelectedIds(new Set());
    setReclaimedIds(new Set());
    setCheckout(null);
  }

  const scanned = (data ?? []).filter((a) => a.kind === "token-account");
  const tokenAccounts = scanned
    .filter(
      (a) => a.blockedReason || excessLamports(a) > 0 || reclaimedIds.has(a.id),
    )
    .sort(byExcess)
    // Finished accounts sink below the ones that still have excess.
    .sort(
      (a, b) => Number(reclaimedIds.has(a.id)) - Number(reclaimedIds.has(b.id)),
    );
  const atMinimum = scanned.length - tokenAccounts.length;
  const mints = [
    ...(data ?? []).filter((a) => a.kind === "mint"),
    ...addedMints,
  ];

  const isOpen = (a: ReclaimableAccount) =>
    !a.blockedReason && !reclaimedIds.has(a.id);
  const openTokenAccounts = tokenAccounts.filter(isOpen);
  const selected = [...tokenAccounts, ...mints].filter(
    (a) => isOpen(a) && selectedIds.has(a.id),
  );
  const selectedLamports = selected.reduce(
    (sum, a) => sum + excessLamports(a),
    0,
  );
  const openMints = mints.filter(isOpen);
  const availableLamports = [...openTokenAccounts, ...openMints].reduce(
    (sum, a) => sum + excessLamports(a),
    0,
  );
  const emptyCount = openTokenAccounts.filter((a) => a.isEmpty).length;
  const transactions = Math.ceil(selected.length / ACCOUNTS_PER_TRANSACTION);
  const serviceFee = serviceFeeLamports(selectedLamports);

  const scan = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    setReclaimedIds(new Set());
    setAddedMints([]);
    const { data } = await refetch();
    setSelectedIds(
      new Set(
        (data ?? []).filter((a) => excessLamports(a) > 0).map((a) => a.id),
      ),
    );
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleMany = (accounts: ReclaimableAccount[], select: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      accounts
        .filter(isOpen)
        .forEach((a) => (select ? next.add(a.id) : next.delete(a.id)));
      return next;
    });

  return (
    <div className="mx-auto w-[min(100%,theme(screens.lg))] bg-white sm:rounded-lg sm:shadow">
      <div className="px-4 pb-6 sm:p-6">
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
                  ) - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte),
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

            {!data && (
              <div className="mt-6 space-y-3">
                <Button color="indigo" onClick={scan} disabled={isFetching}>
                  {isFetching && (
                    <SpinnerIcon className="-ml-1 size-5 animate-spin" />
                  )}
                  {!connected
                    ? "Connect your wallet"
                    : isFetching
                      ? "Checking…"
                      : "Check my accounts"}
                </Button>
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    Couldn&apos;t load your token accounts. Try again in a
                    moment.
                  </p>
                )}
              </div>
            )}
          </div>
          <RentScheduleChart lamportsPerByte={lamportsPerByte} />
        </div>
      </div>

      {data && (
        <>
          <div className="border-t border-zinc-200 px-4 py-6 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="text-base font-semibold text-zinc-900">
                {openTokenAccounts.length + openMints.length > 0
                  ? `${summarise(openTokenAccounts.length, openMints.length)} hold ${formatSol(availableLamports, 5)} SOL more than they need`
                  : tokenAccounts.length + mints.length > 0
                    ? "Nothing left to reclaim"
                    : "Nothing to reclaim right now"}
              </h2>
              <button
                type="button"
                onClick={scan}
                disabled={isFetching}
                className="text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-700 disabled:opacity-50"
              >
                {isFetching ? "Checking again" : "Check again"}
              </button>
            </div>

            <section aria-labelledby="token-accounts-heading" className="mt-6 ">
              <h3
                id="token-accounts-heading"
                className="text-sm font-semibold text-zinc-900"
              >
                Token accounts
              </h3>
              {tokenAccounts.length === 0 ? (
                <p className="mt-4 max-w-prose rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                  {scanned.length === 0
                    ? "This wallet has no token accounts."
                    : "Every token account in this wallet is already at the minimum."}
                  {scanned.length > 0 &&
                    stepsLeft > 0 &&
                    " Rent drops again in November, so check back then."}
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
                    <p className="ml-12 mt-2 text-sm text-zinc-500">
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
                owner={publicKey?.toBase58() ?? ""}
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

          <div className="sticky bottom-0 z-[2] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:rounded-b-lg sm:px-6">
            <div aria-live="polite">
              <div className="text-base font-medium tabular-nums text-zinc-900">
                {formatSol(selectedLamports, 5)} SOL selected
              </div>
              <div className="text-sm text-zinc-500">
                {selected.length === 0
                  ? "Select at least one account"
                  : `${selected.length} ${selected.length === 1 ? "account" : "accounts"}, ${transactions} ${transactions === 1 ? "transaction" : "transactions"}${SERVICE_FEE ? `, ${formatSol(serviceFee)} SOL fee` : ""}`}
              </div>
            </div>
            <Button
              color="indigo"
              disabled={selected.length === 0}
              onClick={() => setCheckout(selected)}
            >
              Review and reclaim
            </Button>
          </div>
        </>
      )}

      {checkout && (
        <ReclaimDialog
          accounts={checkout}
          onConfirmed={(ids) =>
            setReclaimedIds((prev) => new Set([...prev, ...ids]))
          }
          onSettled={() => {
            void refetch();
            void queryClient.invalidateQueries({
              queryKey: ["sol-balance", publicKey?.toString()],
            });
          }}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}

function summarise(tokenAccounts: number, mints: number) {
  const parts = [
    tokenAccounts > 0 &&
      `${tokenAccounts} token ${tokenAccounts === 1 ? "account" : "accounts"}`,
    mints > 0 && `${mints} ${mints === 1 ? "mint" : "mints"}`,
  ].filter(Boolean);
  return parts.join(" and ");
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
