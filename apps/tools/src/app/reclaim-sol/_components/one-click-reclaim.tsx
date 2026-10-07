"use client";

import {
  SERVICE_FEE,
  afterFees,
  formatFeeRate,
  serviceFeeLamports,
} from "@/app/spl-token-tools/reclaim-rent/_components/fee";
import {
  ACCOUNTS_PER_TRANSACTION,
  FEE_PER_TRANSACTION,
} from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import { Tally } from "@/app/spl-token-tools/reclaim-rent/_components/results/tally";
import type {
  CoinState,
  RewardProps,
  RewardStatus,
  Sending,
} from "@/app/spl-token-tools/reclaim-rent/_components/results/types";
import type { ReclaimableAccount } from "@/app/spl-token-tools/reclaim-rent/_components/types";
import {
  closes,
  feeBase,
  reclaimLamports,
} from "@/app/spl-token-tools/reclaim-rent/_components/types";
import {
  WalletRefusedError,
  useReclaimExcess,
} from "@/app/spl-token-tools/reclaim-rent/_components/use-reclaim-excess";
import { notify } from "@/components/notification";
import { chunk } from "@/lib/utils";
import { useReclaimableAccounts } from "@/state/queries/use-reclaimable-accounts";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Band, Invitation } from "./band";
import { useHydrated } from "./use-hydrated";

/** Nothing to choose here: empty token accounts always close. */
const CLOSE_EMPTY = true;

/** As on the full tool: long enough for "Checking…" to settle, no longer. */
const SCAN_MIN_MS = 800;

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

/**
 * What a scan found worth reclaiming, in the order the coins show it: token
 * accounts first, the ones that return the most leading, then mints. The
 * list stays as it was found until the next scan, so the coins keep their
 * places while a reclaim plays out.
 */
function reclaimable(data: ReclaimableAccount[]) {
  return data
    .filter((a) => !a.blockedReason && reclaimLamports(a, CLOSE_EMPTY) > 0)
    .sort(
      (a, b) =>
        Number(a.kind === "mint") - Number(b.kind === "mint") ||
        reclaimLamports(b, CLOSE_EMPTY) - reclaimLamports(a, CLOSE_EMPTY),
    );
}

/**
 * The reclaim-rent tool with every choice made: everything found gets
 * reclaimed, empty accounts close, and the pill sends it all at once, with
 * no review step. It plays out on the same results block as the full tool.
 */
export function OneClickReclaim() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const owner = publicKey?.toBase58() ?? "";
  const { error, refetch } = useReclaimableAccounts(owner);
  // Unlike the full tool's, this stage is server-rendered, and the server
  // can't know the setting: assume motion until hydrated, then follow it.
  const prefersReduced = !!useReducedMotion();
  const reduced = useHydrated() && prefersReduced;

  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const [found, setFound] = useState<ReclaimableAccount[]>([]);
  const [reclaimedIds, setReclaimedIds] = useState(new Set<string>());
  /** What reclaims have put in the wallet since the last scan, in lamports. */
  const [reclaimedLamports, setReclaimedLamports] = useState(0);
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
  const sent = useRef<ReclaimableAccount[][]>([]);

  // Results belong to one wallet on one network: start over when either
  // changes.
  const scope = `${owner} ${connection.rpcEndpoint}`;
  const [stateScope, setStateScope] = useState(scope);
  // For a scan to check, after its wait, that it still has the same scope.
  const latestScope = useRef(scope);
  useEffect(() => {
    latestScope.current = scope;
  });
  if (stateScope !== scope) {
    setStateScope(scope);
    setPhase("idle");
    setFound([]);
    setReclaimedIds(new Set());
    setReclaimedLamports(0);
    setBatches(null);
    setRefusal(null);
  }

  const open = found.filter((a) => !reclaimedIds.has(a.id));
  const reclaimed = found.filter((a) => reclaimedIds.has(a.id));
  const transactions = Math.ceil(open.length / ACCOUNTS_PER_TRANSACTION);
  const net =
    open.reduce((sum, a) => sum + reclaimLamports(a, CLOSE_EMPTY), 0) -
    serviceFeeLamports(feeBase(open)) -
    transactions * FEE_PER_TRANSACTION;

  const status: RewardStatus =
    open.length > 0
      ? net > 0
        ? "ready"
        : "fees-exceed"
      : reclaimed.length > 0
        ? "reclaimed"
        : "nothing";

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
    tokenAccounts: open.filter((a) => a.kind === "token-account").length,
    mints: open.filter((a) => a.kind === "mint").length,
    transactions,
    emptyAccounts: (status === "reclaimed" ? reclaimed : open).filter((a) =>
      closes(a, CLOSE_EMPTY),
    ).length,
  };

  const markBatch = (index: number, status: BatchStatus) =>
    setBatches((prev) =>
      prev ? prev.map((b, i) => (i === index ? { ...b, status } : b)) : prev,
    );

  const reclaim = useReclaimExcess({
    onStage: markBatch,
    onBatchResult: (result) => {
      markBatch(result.index, result.status);
      if (result.status !== "confirmed") return;
      const accounts = sent.current[result.index] ?? [];
      setReclaimedIds(
        (prev) => new Set([...prev, ...accounts.map((a) => a.id)]),
      );
      setReclaimedLamports((prev) => prev + afterFees(accounts, CLOSE_EMPTY));
    },
    // For the balance in the toolbox's top bar, if they go on to a tool.
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ["sol-balance", owner] }),
  });

  /** The pill: send everything that's left, right away. */
  const reclaimNow = async () => {
    if (inFlight || status !== "ready") return;
    const groups = chunk(open, ACCOUNTS_PER_TRANSACTION);
    sent.current = groups;
    setSnapshot(now);
    setRefusal(null);
    setBatches(groups.map((accounts) => ({ accounts, status: "waiting" })));
    try {
      await reclaim.mutateAsync({
        batches: groups.map((accounts, index) => ({ index, accounts })),
        closeEmpty: CLOSE_EMPTY,
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

  /** Set when the pill asked for a wallet: once one connects, check it. */
  const scanOnConnect = useRef(false);

  const scan = async () => {
    if (!connected) {
      scanOnConnect.current = true;
      setVisible(true);
      return;
    }
    const startedIn = scope;
    setPhase("scanning");
    setReclaimedIds(new Set());
    setReclaimedLamports(0);
    setBatches(null);
    setRefusal(null);
    const [{ data, isError }] = await Promise.all([
      refetch(),
      wait(SCAN_MIN_MS),
    ]);
    // The wallet or network changed while it ran: the block has already
    // started over, and these results belong to the old scope.
    if (latestScope.current !== startedIn) return;
    // A failed scan keeps the last results in the cache; don't show them as
    // if they were new.
    if (isError || !data) {
      setPhase("idle");
      return;
    }
    setFound(reclaimable(data));
    setRun((r) => r + 1);
    setPhase("shown");
  };

  // Once a wallet connects because the pill asked for one, check it. The
  // scan has to be this render's, the first with the wallet in it.
  const latestScan = useRef(scan);
  useEffect(() => {
    latestScan.current = scan;
  });
  useEffect(() => {
    if (!connected || !scanOnConnect.current) return;
    scanOnConnect.current = false;
    void latestScan.current();
  }, [connected]);

  const props: RewardProps = {
    status,
    coins: found.map((a) => {
      const state: CoinState = reclaimedIds.has(a.id)
        ? "confirmed"
        : batchOf.get(a.id) === "confirming"
          ? "pending"
          : "selected";
      return { id: a.id, kind: a.kind, state };
    }),
    ...(inFlight && snapshot ? snapshot : now),
    serviceFeeRate: SERVICE_FEE ? formatFeeRate(SERVICE_FEE) : "0%",
    reclaimed: reclaimedLamports,
    reclaimedFrom: {
      tokenAccounts: reclaimed.filter((a) => a.kind === "token-account").length,
      mints: reclaimed.filter((a) => a.kind === "mint").length,
    },
    sending,
    failed:
      failedBatches.length > 0
        ? { transactions: failedBatches.length, of: batches!.length }
        : null,
    rejectedAt: refusal?.count ?? null,
    cancelledAfter:
      refusal && refusal.sent > 0
        ? { transactions: refusal.sent, of: refusal.of }
        : null,
    reveal: true,
    reduced,
    onReclaim: () => void reclaimNow(),
    onRescan: () => void scan(),
  };

  return (
    <Band moving={phase === "scanning"} reduced={reduced}>
      {phase === "shown" ? (
        <Tally key={run} {...props} />
      ) : (
        <Invitation
          connected={connected}
          checking={phase === "scanning"}
          failed={!!error && phase === "idle"}
          reduced={reduced}
          onCheck={() => void scan()}
        />
      )}
    </Band>
  );
}
