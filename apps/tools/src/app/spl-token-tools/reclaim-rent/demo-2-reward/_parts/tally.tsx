"use client";

import { cn } from "@blastctrl/ui";
import { stagger } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatSol } from "../../_components/rent";
import type { Arrival } from "./arrival";
import { useArrival } from "./arrival";
import {
  CheckAgainLink,
  CheckAgainPill,
  Chips,
  Headline,
  ReclaimPill,
  ReclaimedBadge,
  SHARED_HEADLINES,
  sharedDetail,
} from "./bits";
import { CountText, useCountUp } from "./count";
import type { Stoppable } from "./effects";
import {
  burst,
  centerIn,
  fadeIn,
  flipIn,
  flyCoin,
  hop,
  pointIn,
  popIn,
  pulse,
  ringOut,
  shake,
} from "./effects";
import { DOT_GRID, GREEN, coinColor, shareTimes } from "./look";
import type { Coin, RewardProps } from "./types";
import { fromWhere, transactionsNote } from "./types";

/** The whole arrival, in seconds from the moment the scan finishes. */
const T = {
  /** Headline, one word every 40 ms. */
  words: 0,
  /** The pill comes early and works the moment it shows. */
  button: 0.08,
  /** The number appears at zero, then waits for its first coin. */
  amount: 0.12,
  notes: 0.16,
  chips: 0.26,
  /** Each coin pops, then flies to the number and lands as it counts. */
  flight: 0.2,
  count: 0.28,
  countFor: 0.36,
  end: 1,
};
const LAND = T.count + T.countFor;

/**
 * The payoff, in seconds from the moment the last transaction confirms.
 * The pill turns green and the headline rearranges itself while the sweep
 * turns the last coins over, then the number thumps, and once every coin is
 * green a hop runs through them.
 */
const PAYOFF = {
  badge: 0,
  headline: 0,
  number: 0.3,
  hop: 0.45,
};

/** Past this many coins the row stops meaning anything; the rest are "+N". */
const MAX_COINS = 120;

/**
 * The coin row shows progress, not which account went in which
 * transaction: transactions land in any order, but coins turn green from
 * the left. Of the coins in play, the first ones show as reclaimed, the
 * next as waiting on the chain, and the rest as still to send. The counts
 * stay true; only the order is tidied. Unticked coins keep their places.
 */
function inOrder(coins: Coin[]): Coin[] {
  let confirmed = 0;
  let pending = 0;
  for (const c of coins) {
    if (c.state === "confirmed") confirmed++;
    else if (c.state === "pending") pending++;
  }
  return coins.map((c) => {
    if (c.state === "unselected") return c;
    const state =
      confirmed-- > 0 ? "confirmed" : pending-- > 0 ? "pending" : "selected";
    return state === c.state ? c : { ...c, state };
  });
}

/**
 * Coins turn over one after another at this pace, a whole row in about a
 * second and a bit. When several transactions land close together their
 * coins join one sweep instead of starting waves of their own.
 */
const sweepGap = (coins: number) => Math.min(0.022, 1.2 / Math.max(1, coins));

/** The sweep's clock, in ms. Only read from effects. */
const clockNow = () => performance.now();

/** Coins waiting on the chain breathe in a wave, one cycle a second. */
const WAITING_CSS = `
  @keyframes coin-wait { 50% { transform: scale(0.8); opacity: 0.45; } }
  .coin-wait { animation: coin-wait 1.1s ease-in-out infinite; }
`;

/** A coin's flight from an account to the number: up, over, and in. */
function toss(
  layer: HTMLElement,
  coin: Element,
  digits: Element,
  delay: number,
  duration: number,
) {
  // Land on the baseline, not on the glyphs: the coin sinks into the
  // number from below instead of speckling its digits.
  const from = centerIn(layer, coin);
  const to = pointIn(layer, digits, { x: [0.3, 0.95], y: [0.8, 0.8] });
  const via = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 14 };
  return flyCoin(layer, from, via, to, { delay, duration, color: GREEN });
}

const ARRIVAL: Arrival = {
  hide: "[data-word],[data-pop],[data-fade],[data-coin]",
  end: T.end,
  run: ({ layer, at, all, one }) => {
    const running: Stoppable[] = [
      popIn(all("[data-word]"), stagger(0.04, { startDelay: at(T.words) }), {
        scale: 0.9,
        y: 14,
      }),
      popIn(all("[data-pop=button]"), at(T.button)),
      popIn(all("[data-pop=amount]"), at(T.amount), { scale: 0.85, y: 10 }),
      popIn(all("[data-pop=chip]"), stagger(0.06, { startDelay: at(T.chips) })),
      fadeIn(all("[data-fade]"), at(T.notes)),
    ];

    // Each coin pops just in time for its SOL to land as the number passes
    // its share of the total.
    const digits = one("[data-digits]");
    const coins = all("[data-coin]");
    const pops = shareTimes(coins.length, T.count, T.countFor);
    coins.forEach((coin, i) => {
      const start = pops[i]! - T.flight;
      running.push(popIn(coin, at(start), { scale: 0 }));
      if (digits && (coin as HTMLElement).dataset.state === "selected") {
        running.push(
          toss(layer, coin, digits, at(start + 0.03), T.flight - 0.03),
        );
      }
    });

    // The last coin lands: the number thumps and the pill sends out a ring.
    const amount = one("[data-pop=amount]");
    const button = one("[data-pop=button]") as HTMLButtonElement | null;
    const ring = one("[data-ring]");
    if (amount && coins.length > 0) running.push(pulse(amount, at(LAND)));
    if (ring && button && !button.disabled) {
      running.push(ringOut(ring, at(LAND)), pulse(button, at(LAND), 0.04));
    }
    return running;
  },
};

/**
 * The results block: the Stage, with the promo's "Reclaim the excess" scene
 * folded into it. Every account is a coin, and the total is counted from
 * them. Coins pop in a wave, each tosses its SOL into the number, and on the
 * last one the number thumps and the pill sends out a ring.
 *
 * Reclaiming plays out in the same block. While the chain confirms, the
 * coins involved breathe; as each transaction lands, the next stretch of
 * coins from the left turns over to green checks, whichever transaction it
 * was. When the last one lands the pill turns into a green badge,
 * the headline rearranges into "Your SOL is back." and a hop runs through
 * the coins. If anything fails there's no payoff, just a way to try again.
 */
export function Tally(p: RewardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [play] = useState(p.reveal && !p.reduced);
  const arriving = useArrival(rootRef, layerRef, play, ARRIVAL);

  const muted = p.status === "none-selected";
  const amount = p.status === "reclaimed" ? p.reclaimed : Math.max(0, p.net);
  const text = useCountUp(
    amount,
    p.reveal ? { delay: T.count, duration: T.countFor } : null,
    p.reduced,
  );

  const coins = inOrder(p.coins.slice(0, MAX_COINS));
  const overflow = p.coins.length - coins.length;
  const states = coins.map((c) => c.state[0]).join("");
  const busy = p.sending !== null;

  // Once this block has sent something, a new headline rearranges the old
  // one instead of just replacing it. Adjusted during render so the
  // headline already knows on the render where the SOL comes back.
  const [hasSent, setHasSent] = useState(false);
  if (busy && !hasSent) setHasSent(true);

  // A coin changing state answers for itself: ticked, it pops and tosses
  // its SOL into the number; unticked, it deflates; confirmed, it turns
  // over to a green check, joining the sweep from the left.
  // Before paint, so a coin never shows its new face at full size first.
  // Nothing here is cancelled when the next change comes: a transaction
  // confirming mid-flip must not leave the last group's coins edge-on.
  const previous = useRef(states);
  /** When the sweep is free to turn its next coin (performance.now, ms). */
  const sweepAt = useRef(0);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = states;
    const root = rootRef.current;
    const layer = layerRef.current;
    if (p.reduced || arriving() || !root || !layer) return;
    if (before === states || before.length !== states.length) return;
    const digits = root.querySelector("[data-digits]");
    const coinEls = root.querySelectorAll<HTMLElement>("[data-coin]");
    let inPlay = 0;
    for (const s of states) if (s !== "u") inPlay++;
    const gap = sweepGap(inPlay) * 1000;
    const clock = clockNow();
    let turnAt = Math.max(clock, sweepAt.current);
    let ticked = 0;
    for (let i = 0; i < states.length; i++) {
      const coin = coinEls[i];
      const was = before[i];
      const now = states[i];
      if (!coin || was === now) continue;
      if (now === "c") {
        coin.style.transform = "scaleX(0)";
        flipIn(coin, (turnAt - clock) / 1000);
        turnAt += gap;
        sweepAt.current = turnAt;
      } else if (now === "s" && was === "u") {
        const delay = Math.min(ticked++, 20) * 0.02;
        popIn(coin, delay, { scale: 0.3 });
        if (digits) toss(layer, coin, digits, delay + 0.03, 0.22);
      } else if (now === "u") {
        popIn(coin, 0, { scale: 1.4 });
      }
    }
  }, [states, p.reduced, arriving]);

  // The payoff, once, when a reclaim in flight ends with everything done.
  // Before paint too: the badge must not flash before it pops.
  const wasBusy = useRef(false);
  useLayoutEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    const finished = wasBusy.current && p.status === "reclaimed";
    wasBusy.current = false;
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!finished || p.reduced || !root || !layer) return;
    const badge = root.querySelector<HTMLElement>("[data-badge]");
    const ring = root.querySelector("[data-ring-done]");
    const number = root.querySelector("[data-pop=amount]");
    const running: Stoppable[] = [];
    if (badge) {
      badge.style.opacity = "0";
      running.push(
        popIn(badge, PAYOFF.badge, { scale: 0.8 }),
        burst(layer, badge, PAYOFF.badge + 0.08),
      );
    }
    if (ring) running.push(ringOut(ring, PAYOFF.badge + 0.04));
    if (number) running.push(pulse(number, PAYOFF.number, 0.09));
    // The hop waits for the sweep to reach the last coin and settle, so it
    // never runs through coins that are still turning.
    const sweepLeft = (sweepAt.current - clockNow()) / 1000;
    running.push(
      hop(
        [...root.querySelectorAll("[data-coin]")],
        Math.max(PAYOFF.hop, sweepLeft + 0.3),
      ),
    );
    return () => running.forEach((r) => r.stop());
  }, [busy, p.status, p.reduced]);

  // The wallet said no: the pill shakes its head.
  useEffect(() => {
    const pill = rootRef.current?.querySelector("[data-pill]");
    if (p.rejectedAt === null || p.reduced || !pill) return;
    const running = shake(pill);
    return () => running.stop();
  }, [p.rejectedAt, p.reduced]);

  const headline = SHARED_HEADLINES[p.status] ?? "Get your *SOL back.";
  const canReclaim = p.status === "ready" && !busy;

  return (
    <div
      ref={rootRef}
      className={`relative -mx-4 border-b border-zinc-200 px-4 py-9 sm:-mx-6 sm:px-8 sm:py-11 ${DOT_GRID}`}
    >
      <style>{WAITING_CSS}</style>
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="min-w-0 md:max-w-xl">
          <Headline
            words={headline}
            morph={hasSent && !p.reduced}
            delay={PAYOFF.headline}
          />

          {p.status !== "nothing" && p.status !== "fees-exceed" && (
            <p
              data-pop="amount"
              className="mt-3 origin-left font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl"
              style={{ color: muted ? "#a1a1aa" : GREEN }}
            >
              <span aria-hidden="true">
                {muted ? "" : "+"}
                <CountText data-digits text={text} /> SOL
              </span>
              <span className="sr-only">
                {formatSol(amount, 5)} SOL
                {p.status === "reclaimed" ? " reclaimed" : ""}
              </span>
            </p>
          )}

          {coins.length > 0 && (
            <span
              aria-hidden="true"
              className="mt-4 flex max-w-md flex-wrap gap-1"
            >
              {coins.map((c, i) => (
                <CoinDot
                  key={c.id}
                  coin={c}
                  index={i}
                  size={
                    coins.length > 60
                      ? "size-2"
                      : coins.length > 30
                        ? "size-2.5"
                        : "size-3 sm:size-3.5"
                  }
                  dim={busy && c.state === "unselected"}
                  waiting={c.state === "pending" && !p.reduced}
                  animated={!p.reduced}
                />
              ))}
              {overflow > 0 && (
                <span className="self-center pl-1 text-xs text-zinc-500">
                  +{overflow}
                </span>
              )}
            </span>
          )}

          <Detail {...p} busy={busy} />

          {p.status !== "nothing" && p.status !== "fees-exceed" && (
            <Chips closesEmpty={p.emptyAccounts > 0} />
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2.5 md:items-end">
          {p.status === "nothing" ? (
            <CheckAgainPill onClick={p.onRescan} />
          ) : p.status === "reclaimed" ? (
            <>
              <ReclaimedBadge className="px-10 md:min-w-[18rem]" />
              <CheckAgainLink
                onClick={p.onRescan}
                className="self-center md:self-end"
              />
            </>
          ) : (
            <>
              <ReclaimPill
                disabled={!canReclaim && !busy}
                busy={busy}
                onClick={p.onReclaim}
                className="px-10 md:min-w-[18rem]"
              >
                {pillLabel(p)}
              </ReclaimPill>
              <p
                data-fade
                className="text-center text-xs text-zinc-500 md:text-right"
              >
                {p.sending
                  ? p.sending.transactions === 1
                    ? "Keep this page open until it's confirmed"
                    : "Keep this page open until they're confirmed"
                  : canReclaim
                    ? transactionsNote(p.transactions, p.serviceFeeRate)
                    : " "}
              </p>
              {!busy && (
                <CheckAgainLink
                  onClick={p.onRescan}
                  className="self-center md:self-end"
                />
              )}
            </>
          )}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {liveText(p)}
      </p>
      <div
        ref={layerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      />
    </div>
  );
}

function CoinDot({
  coin,
  index,
  size,
  dim,
  waiting,
  animated,
}: {
  coin: Coin;
  index: number;
  size: string;
  dim: boolean;
  waiting: boolean;
  animated: boolean;
}) {
  const style: CSSProperties =
    coin.state === "confirmed"
      ? { backgroundColor: GREEN }
      : coin.state === "unselected"
        ? {
            backgroundColor: "transparent",
            boxShadow: "inset 0 0 0 1.5px #d4d4d8",
          }
        : { backgroundColor: coinColor(coin.id) };
  // Start every coin mid-cycle so the wave is already running, its crest
  // travelling left to right.
  if (waiting) style.animationDelay = `${((index * 45) % 1100) - 1100}ms`;
  return (
    <span
      data-coin
      data-state={coin.state}
      className={cn(
        "grid place-content-center text-white",
        size,
        coin.kind === "mint" ? "rounded-[4px]" : "rounded-full",
        animated &&
          "transition-[background-color,box-shadow,opacity] duration-150",
        dim && "opacity-40",
        waiting && "coin-wait",
      )}
      style={style}
    >
      {coin.state === "confirmed" && size.startsWith("size-3") && (
        <svg viewBox="0 0 12 12" className="size-2.5">
          <path
            d="M2.5 6.4 4.9 8.7 9.5 3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function pillLabel(p: RewardProps) {
  const s = p.sending;
  if (s?.step === "signing") {
    return s.prompt
      ? `Check your wallet, ${s.prompt} of ${s.transactions}`
      : "Check your wallet";
  }
  if (s?.step === "confirming") {
    return s.transactions > 1
      ? `Reclaiming, ${s.confirmed} of ${s.transactions}`
      : "Reclaiming…";
  }
  return p.failed ? "Try again" : "Reclaim it";
}

function Detail(p: RewardProps & { busy: boolean }) {
  const shared = sharedDetail(p);
  let text: ReactNode = shared;
  let tone = "text-zinc-600";
  if (shared) {
    // Nothing else to say in the states that have their own sentence.
  } else if (p.failed && !p.busy) {
    tone = "text-red-700";
    const { transactions, of, accounts } = p.failed;
    text =
      of === 1
        ? "That didn't go through. Your accounts are untouched, so you can try again."
        : `${transactions} of ${of} transactions didn't go through. ${transactions === 1 ? "Its" : "Their"} ${accounts} accounts are untouched, so you can try again.`;
  } else if (p.rejectedAt !== null && !p.busy) {
    tone = "text-zinc-800";
    text = "Cancelled in your wallet. Nothing was sent.";
  } else {
    text =
      p.status === "ready"
        ? `From ${fromWhere(p.tokenAccounts, p.mints)}.`
        : "Select at least one account below.";
  }
  return (
    <p data-fade className={cn("mt-3 max-w-md text-sm text-pretty", tone)}>
      {text}
    </p>
  );
}

/** What a screen reader hears as the reclaim moves along. */
function liveText(p: RewardProps) {
  const s = p.sending;
  if (s?.step === "signing") return "Approve the reclaim in your wallet.";
  if (s?.step === "confirming") {
    return s.transactions > 1
      ? `Reclaiming. ${s.confirmed} of ${s.transactions} transactions confirmed.`
      : "Reclaiming. Waiting for confirmation.";
  }
  if (p.status === "reclaimed") {
    return `Reclaimed ${formatSol(p.reclaimed, 5)} SOL.`;
  }
  if (p.failed) return "Some transactions didn't go through.";
  if (p.rejectedAt !== null) return "Cancelled in your wallet.";
  return "";
}
