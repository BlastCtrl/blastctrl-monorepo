"use client";

import { useReclaimableAccounts } from "@/state/queries/use-reclaimable-accounts";
import { useQueryClient } from "@tanstack/react-query";
import { Button, SpinnerIcon } from "@blastctrl/ui";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useState } from "react";
import { AccountTable } from "./_components/account-table";
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
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const { lamportsPerByte } = useRentRate();
  const stepsLeft = remainingSteps(lamportsPerByte);
  const { data, isFetching, error, refetch } = useReclaimableAccounts(
    publicKey?.toBase58() ?? "",
  );
  const [mints, setMints] = useState<ReclaimableAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [reclaimedIds, setReclaimedIds] = useState(new Set<string>());
  const [checkout, setCheckout] = useState<ReclaimableAccount[] | null>(null);

  const tokenAccounts = (data ?? [])
    .filter(
      (a) => a.blockedReason || excessLamports(a) > 0 || reclaimedIds.has(a.id),
    )
    .sort(byExcess)
    // Finished accounts sink below the ones that still have excess.
    .sort(
      (a, b) => Number(reclaimedIds.has(a.id)) - Number(reclaimedIds.has(b.id)),
    );
  const atMinimum = (data?.length ?? 0) - tokenAccounts.length;

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
  const availableLamports = openTokenAccounts.reduce(
    (sum, a) => sum + excessLamports(a),
    0,
  );
  const emptyCount = openTokenAccounts.filter((a) => a.isEmpty).length;
  const transactions = Math.ceil(selected.length / ACCOUNTS_PER_TRANSACTION);

  const scan = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    setReclaimedIds(new Set());
    setMints([]);
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
              Refund excess rent
            </h1>
            <div className="mt-4 max-w-prose space-y-2 text-pretty text-gray-500">
              <p>
                Every account on Solana holds a SOL deposit (rent), and the
                required deposit is{" "}
                <a
                  href="https://solana.com/upgrades/reduced-rent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  being lowered in five steps
                </a>
                . Token accounts you opened earlier still hold the old, larger
                amount.
              </p>
              <p>
                This tool moves the difference back to your wallet. Your tokens
                don&apos;t move and nothing gets closed. Today that is{" "}
                {formatSol(
                  minimumBalance(
                    TOKEN_ACCOUNT_SIZE,
                    ORIGINAL_LAMPORTS_PER_BYTE,
                  ) - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte),
                  5,
                )}{" "}
                SOL for a typical token account
                {stepsLeft > 0 && ", and it grows with each step"}.
              </p>
              <p>
                Every account with excess SOL starts out selected. Uncheck any
                you&apos;d rather leave as they are before you refund.
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
                      ? "Checking your accounts"
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
            <TabGroup>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <h2 className="text-lg font-medium text-zinc-900">
                  {openTokenAccounts.length > 0
                    ? `${openTokenAccounts.length} token accounts hold ${formatSol(availableLamports, 5)} SOL more than they need`
                    : tokenAccounts.length > 0
                      ? "Every token account is down to its minimum"
                      : "Nothing to reclaim right now"}
                </h2>
                <TabList className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium">
                  {[
                    `Token accounts`,
                    mints.length > 0 ? `Mints (${mints.length})` : "Mints",
                  ].map((label, i) => (
                    <Tab
                      key={i}
                      className="rounded-md px-3 py-1 text-zinc-600 focus:outline-none data-[selected]:bg-white data-[selected]:text-zinc-900 data-[selected]:shadow-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500"
                    >
                      {label}
                    </Tab>
                  ))}
                </TabList>
              </div>

              <TabPanels className="mt-4">
                <TabPanel className="space-y-4 focus:outline-none">
                  {tokenAccounts.length === 0 ? (
                    <p className="max-w-prose rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                      All {atMinimum} token accounts in this wallet hold exactly
                      the deposit they need.{" "}
                      {stepsLeft > 0 &&
                        "Rent drops again in November, so check back then. "}
                      If you control a mint, you can still check it on the Mints
                      tab.
                    </p>
                  ) : (
                    <>
                      {emptyCount > 0 && (
                        <EmptyAccountsHint count={emptyCount} />
                      )}
                      <AccountTable
                        accounts={tokenAccounts}
                        selectedIds={selectedIds}
                        reclaimedIds={reclaimedIds}
                        onToggle={toggle}
                        onToggleAll={(select) =>
                          toggleMany(tokenAccounts, select)
                        }
                      />
                      {atMinimum > 0 && (
                        <p className="text-xs text-zinc-500">
                          {atMinimum} newer accounts already hold the minimum
                          and aren&apos;t listed.
                        </p>
                      )}
                    </>
                  )}
                </TabPanel>
                <TabPanel className="focus:outline-none">
                  <MintPanel
                    mints={mints}
                    selectedIds={selectedIds}
                    reclaimedIds={reclaimedIds}
                    onAdd={(mint) => {
                      setMints((prev) => [...prev, mint]);
                      setSelectedIds((prev) => new Set(prev).add(mint.id));
                    }}
                    onToggle={toggle}
                    onToggleAll={(select) => toggleMany(mints, select)}
                  />
                </TabPanel>
              </TabPanels>
            </TabGroup>
          </div>

          <div className="sticky bottom-0 z-[2] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:rounded-b-lg sm:px-6">
            <div aria-live="polite">
              <div className="text-base font-medium tabular-nums text-zinc-900">
                {formatSol(selectedLamports, 5)} SOL selected
              </div>
              <div className="text-sm text-zinc-500">
                {selected.length === 0
                  ? "Pick at least one account"
                  : `${selected.length} ${selected.length === 1 ? "account" : "accounts"}, ${transactions} ${transactions === 1 ? "transaction" : "transactions"}`}
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

function EmptyAccountsHint({ count }: { count: number }) {
  return (
    <p className="max-w-prose rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {count === 1
        ? "One of these accounts holds no tokens."
        : `${count} of these accounts hold no tokens.`}{" "}
      This tool only takes back the excess. Closing an empty account returns its
      whole deposit, about{" "}
      {formatSol(
        minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE),
        5,
      )}{" "}
      SOL.{" "}
      <Link
        href="/spl-token-tools/close-empty"
        className="font-medium underline underline-offset-2"
      >
        Go to the Close empty accounts tool
      </Link>
    </p>
  );
}
