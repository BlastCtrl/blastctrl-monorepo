import { useEffect, useRef, useState } from "react";

export const OUTCOMES = [
  { id: "confirm", name: "Confirms" },
  { id: "one-fails", name: "One transaction fails" },
  { id: "reject", name: "Wallet says no" },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["id"];

export const WALLETS = [
  { id: "one-prompt", name: "Wallet asks once" },
  { id: "per-transaction", name: "Wallet asks per transaction" },
] as const;
export type WalletMode = (typeof WALLETS)[number]["id"];

export type SimStatus =
  "waiting" | "signing" | "confirming" | "confirmed" | "failed";
export type SimBatch = { ids: string[]; status: SimStatus };

/** How long the person takes to approve in their wallet. */
const APPROVE_MS = 1100;
/** Each transaction takes 2 to 3 seconds to confirm. */
const confirmMs = () => 2000 + Math.random() * 1000;

/**
 * Stands in for `useReclaimExcess`, with the same shape of events. With a
 * wallet that asks once, every transaction is signed together and they
 * confirm side by side; otherwise the wallet asks for each in turn, and the
 * next prompt waits for the last confirmation, like the real hook. Turning
 * the wallet down sends nothing.
 */
export function useFakeReclaim({
  outcome,
  wallet,
  onConfirmed,
}: {
  outcome: Outcome;
  wallet: WalletMode;
  onConfirmed: (ids: string[]) => void;
}) {
  const [batches, setBatches] = useState<SimBatch[] | null>(null);
  const [rejectedAt, setRejectedAt] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };
  const mark = (i: number, status: SimStatus) =>
    setBatches((prev) =>
      prev ? prev.map((b, j) => (j === i ? { ...b, status } : b)) : prev,
    );

  const start = (groups: string[][]) => {
    clear();
    setRejectedAt(null);
    const failing = outcome === "one-fails" ? groups.length - 1 : -1;
    const settle = (i: number) => {
      if (i === failing) return mark(i, "failed");
      mark(i, "confirmed");
      onConfirmed(groups[i]!);
    };
    const reject = () => {
      setBatches(null);
      setRejectedAt(Date.now());
    };

    if (wallet === "one-prompt") {
      setBatches(groups.map((ids) => ({ ids, status: "signing" })));
      later(APPROVE_MS, () => {
        if (outcome === "reject") return reject();
        groups.forEach((_, i) => {
          mark(i, "confirming");
          later(confirmMs(), () => settle(i));
        });
      });
      return;
    }

    setBatches(groups.map((ids) => ({ ids, status: "waiting" })));
    let t = 0;
    for (let i = 0; i < groups.length; i++) {
      later(t, () => mark(i, "signing"));
      if (outcome === "reject") {
        later(t + APPROVE_MS, reject);
        return;
      }
      const confirming = confirmMs();
      later(t + APPROVE_MS, () => mark(i, "confirming"));
      later(t + APPROVE_MS + confirming, () => settle(i));
      t += APPROVE_MS + confirming;
    }
  };

  /** Forget the last run: a new scan, or the person moved on. */
  const reset = () => {
    clear();
    setBatches(null);
    setRejectedAt(null);
  };

  return { batches, rejectedAt, start, reset };
}
