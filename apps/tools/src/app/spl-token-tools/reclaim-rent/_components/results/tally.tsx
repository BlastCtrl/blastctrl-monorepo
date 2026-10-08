"use client";

import { compress } from "@/lib/solana";
import { cn } from "@blastctrl/ui";
import type { AnimationSequence, MotionValue } from "motion/react";
import { motion, stagger, useAnimate } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatSol } from "../rent";
import {
  CheckAgainLink,
  CheckAgainPill,
  Chips,
  DetailsToggle,
  Headline,
  ReclaimPill,
  ReclaimedBadge,
  HEADLINES,
  sharedDetail,
} from "./bits";
import { useCountUp } from "./count";
import type { Stoppable } from "./effects";
import {
  FADE_IN,
  HOP,
  RING_OUT,
  burst,
  centerIn,
  flipIn,
  flipOut,
  flyCoin,
  pointIn,
  pop,
  popIn,
  pulse,
  settle,
  shake,
  step,
} from "./effects";
import { COUNT_EASE, GREEN, coinColor, shareTimes } from "./look";
import { cues } from "./sound";
import type { Coin, RewardProps } from "./types";
import { fromWhere, transactionCount } from "./types";

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
 * The pill turns green while the sweep turns the last coins over, then the
 * number thumps, and once every coin is green a hop runs through them.
 */
const PAYOFF = {
  badge: 0,
  number: 0.3,
  hop: 0.45,
};

/**
 * Coins tick as they pop in and as they turn green: one tick per this many
 * coins, and at most MAX_TICKS a wave, so a big wallet doesn't rattle.
 */
const COINS_PER_TICK = 2;
const MAX_TICKS = 15;
const tickEvery = (coins: number) =>
  Math.max(COINS_PER_TICK, Math.ceil(coins / MAX_TICKS));

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

/**
 * A coin turning over to green, at `delay` seconds. React has already given
 * it the green face and the check, so before paint the old face goes back
 * on and the check is hidden. At its turn the old face narrows to edge-on,
 * the green one is put on with no colour transition, and it opens out. A
 * coin that was breathing first comes to rest, since React has just taken
 * its breath away.
 */
function turnOver(coin: HTMLElement, delay: number, wasWaiting: boolean) {
  coin.style.backgroundColor = coin.dataset.coinColor ?? "";
  coin.style.color = "transparent";
  if (wasWaiting) settle(coin);
  void flipOut(coin, delay).then(() => {
    coin.style.transition = "none";
    coin.style.backgroundColor = GREEN;
    coin.style.color = "";
    void coin.offsetWidth; // Flush, so the swap isn't transitioned.
    coin.style.transition = "";
    flipIn(coin, 0);
  });
}

/** Motion's `animate`, scoped to the block by `useAnimate`. */
type Animate = ReturnType<typeof useAnimate>[1];

/**
 * The arrival: one timeline from the moment the scan finishes, with every
 * step at its time in `T`. Each element holds at its first keyframe until
 * its step, so nothing shows before its moment. The coins pop just in time
 * for their SOL to land as the number passes their share of the total; the
 * flights and the ticks run alongside on the same clock. `past` is how far
 * along the timeline already is, so a second run (React's double effect in
 * development) resumes it instead of starting over.
 */
function arrive(
  animate: Animate,
  root: HTMLElement,
  layer: HTMLElement,
  value: MotionValue<number>,
  amount: number,
  past: number,
): Stoppable[] {
  const coins = [...root.querySelectorAll<HTMLElement>("[data-coin]")];
  const digits = root.querySelector("[data-digits]");
  const button = root.querySelector<HTMLButtonElement>("[data-pop=button]");
  const pops = shareTimes(coins.length, T.count, T.countFor);

  const timeline = animate([
    step("[data-word]", popIn(0.9, 14), T.words, { delay: stagger(0.04) }),
    step("[data-pop=button]", popIn(), T.button),
    step("[data-pop=amount]", popIn(0.85, 10), T.amount),
    step("[data-fade]", FADE_IN, T.notes),
    step("[data-pop=chip]", popIn(), T.chips, { delay: stagger(0.06) }),
    ...coins.map((coin, i) => step(coin, popIn(0.4), pops[i]! - T.flight)),
    [
      value,
      [0, amount],
      { at: T.count, duration: T.countFor, ease: COUNT_EASE },
    ],
    // The last coin lands: the number thumps and the pill pulses once.
    ...(coins.length > 0 ? [step("[data-pop=amount]", pulse(), LAND)] : []),
    ...(button && !button.disabled ? [step(button, pulse(), LAND)] : []),
  ] satisfies AnimationSequence);
  timeline.time = past;

  const running: Stoppable[] = [timeline];
  const every = tickEvery(coins.length);
  // Past a few dozen coins the flights read as a swarm whichever coins
  // they come from; fewer of them keeps the layer count down.
  const tossEvery = coins.length > 80 ? 3 : coins.length > 40 ? 2 : 1;
  coins.forEach((coin, i) => {
    const start = pops[i]! - T.flight - past;
    if (i % every === 0) {
      const tick = window.setTimeout(cues.arriving, Math.max(0, start) * 1000);
      running.push({ stop: () => window.clearTimeout(tick) });
    }
    if (digits && i % tossEvery === 0 && coin.dataset.state === "selected") {
      running.push(toss(layer, coin, digits, start + 0.03, T.flight - 0.03));
    }
  });
  return running;
}

/**
 * The results block: the Stage, with the promo's "Reclaim the excess" scene
 * folded into it. Every account is a coin, and the total is counted from
 * them. Coins pop in a wave, each tosses its SOL into the number, and on the
 * last one the number thumps and the pill sends out a ring.
 *
 * Reclaiming plays out in the same block. While the chain confirms, the
 * coins involved breathe; as each transaction lands, the next stretch of
 * coins from the left turns over to green checks, whichever transaction it
 * was. When the last one lands the pill turns into a green badge, the
 * number thumps and a hop runs through the coins. If anything fails there's no payoff, just a way to try again.
 */
export function Tally(p: RewardProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const layerRef = useRef<HTMLDivElement>(null);
  const [play] = useState(p.reveal && !p.reduced);

  const muted = p.status === "none-selected";
  const amount = p.status === "reclaimed" ? p.reclaimed : Math.max(0, p.net);
  const { text, value } = useCountUp(amount, play, p.reduced);

  // The arrival plays once, on mount, and counts up to the amount it found
  // there; if the amount changes mid-count, the count springs after it.
  // Nothing but unmounting stops it: a background tab only pauses it.
  const [arrivalAmount] = useState(amount);
  const startedAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    const root = scope.current;
    const layer = layerRef.current;
    if (!play || !root || !layer) return;
    startedAt.current ??= clockNow();
    const past = (clockNow() - startedAt.current) / 1000;
    const running = arrive(animate, root, layer, value, arrivalAmount, past);
    return () => running.forEach((r) => r.stop());
  }, [play, scope, animate, value, arrivalAmount]);

  const coins = inOrder(p.coins.slice(0, MAX_COINS));
  const overflow = p.coins.length - coins.length;
  const states = coins.map((c) => c.state[0]).join("");
  const busy = p.sending !== null;

  // A coin changing state answers for itself: ticked, it pops and tosses
  // its SOL into the number; unticked, it deflates; confirmed, it turns
  // over to a green check, joining the sweep from the left; back from
  // waiting after a failed transaction, it comes to rest.
  // Before paint, so a coin never shows its green face before its turn.
  // Nothing here is cancelled when the next change comes: a transaction
  // confirming mid-flip must not leave the last group's coins edge-on.
  const previous = useRef(states);
  /** When the sweep is free to turn its next coin (performance.now, ms). */
  const sweepAt = useRef(0);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = states;
    const root = scope.current;
    const layer = layerRef.current;
    // While the arrival plays, it has the coins; keep out of its way.
    const arriving =
      startedAt.current !== null &&
      clockNow() - startedAt.current < T.end * 1000;
    if (p.reduced || arriving || !root || !layer) return;
    if (before === states || before.length !== states.length) return;
    const digits = root.querySelector("[data-digits]");
    const coinEls = root.querySelectorAll<HTMLElement>("[data-coin]");
    let inPlay = 0;
    for (const s of states) if (s !== "u") inPlay++;
    const gap = sweepGap(inPlay) * 1000;
    const clock = clockNow();
    let turnAt = Math.max(clock, sweepAt.current);
    let ticked = 0;
    let turning = 0;
    for (let i = 0; i < states.length; i++) {
      if (states[i] === "c" && before[i] !== "c") turning++;
    }
    const every = tickEvery(turning);
    let turned = 0;
    for (let i = 0; i < states.length; i++) {
      const coin = coinEls[i];
      const was = before[i];
      const now = states[i];
      if (!coin || was === now) continue;
      if (now === "c") {
        turnOver(coin, (turnAt - clock) / 1000, was === "p");
        // Experiment: each coin that turns green clinks, quietly.
        if (turned++ % every === 0) {
          window.setTimeout(cues.turning, turnAt - clock);
        }
        turnAt += gap;
        sweepAt.current = turnAt;
      } else if (now === "s" && was === "u") {
        const delay = Math.min(ticked++, 20) * 0.02;
        pop(coin, delay, 0.3);
        if (digits) toss(layer, coin, digits, delay + 0.03, 0.22);
      } else if (now === "s" && was === "p") {
        settle(coin);
      } else if (now === "u") {
        pop(coin, 0, 1.4);
      }
    }
  }, [states, p.reduced, scope]);

  // The payoff, once, when a reclaim in flight ends with everything done.
  // Before paint too: the badge must not flash before it pops. The sound
  // plays even with motion off; a failure gets a quiet one and no payoff.
  const wasBusy = useRef(false);
  const failedHow = p.failed
    ? p.failed.transactions < p.failed.of
      ? "partly"
      : "all"
    : null;
  useLayoutEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    const finished = wasBusy.current && p.status === "reclaimed";
    // The chord waits for the sweep: coins clink as they turn, then the
    // chord resolves it. With motion off there's no sweep, so it's at once.
    if (finished) {
      const sweepLeft = Math.max(0, sweepAt.current - clockNow());
      window.setTimeout(cues.reclaimed, p.reduced ? 0 : sweepLeft + 50);
    } else if (wasBusy.current && failedHow === "partly") cues.partlyFailed();
    else if (wasBusy.current && failedHow === "all") cues.failed();
    wasBusy.current = false;
    const root = scope.current;
    const layer = layerRef.current;
    if (!finished || p.reduced || !root || !layer) return;
    const badge = root.querySelector("[data-badge]");
    const coins = root.querySelectorAll("[data-coin]").length;
    // The hop waits for the sweep to reach the last coin and settle, so it
    // never runs through coins that are still turning.
    const sweepLeft = (sweepAt.current - clockNow()) / 1000;
    const running: Stoppable[] = [
      animate([
        step("[data-badge]", popIn(0.8), PAYOFF.badge),
        step("[data-ring-done]", RING_OUT, PAYOFF.badge + 0.04),
        step("[data-pop=amount]", pulse(0.09), PAYOFF.number),
        step("[data-coin]", HOP, Math.max(PAYOFF.hop, sweepLeft + 0.3), {
          delay: stagger(Math.min(0.02, 0.4 / coins)),
        }),
      ]),
    ];
    if (badge) running.push(burst(layer, badge, PAYOFF.badge + 0.08));
    return () => running.forEach((r) => r.stop());
  }, [busy, p.status, p.reduced, failedHow, scope, animate]);

  // The wallet said no: the pill shakes its head.
  useEffect(() => {
    const pill = scope.current?.querySelector("[data-pill]");
    if (p.rejectedAt === null || p.reduced || !pill) return;
    const running = shake(pill);
    return () => running.stop();
  }, [p.rejectedAt, p.reduced, scope]);

  const headline = HEADLINES[p.status];
  const canReclaim = p.status === "ready" && !busy;

  return (
    <div ref={scope} className="relative">
      <style>{WAITING_CSS}</style>
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="min-w-0 md:max-w-xl">
          {headline ? (
            <Headline words={headline} />
          ) : (
            // No headline over the amount, but still a heading for screen
            // readers to find the block by.
            <h2 className="sr-only">
              {p.status === "reclaimed"
                ? "Your SOL is back"
                : "Get your SOL back"}
            </h2>
          )}

          {p.status !== "nothing" && p.status !== "fees-exceed" && (
            <p
              data-pop="amount"
              className="origin-left font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl"
              style={{ color: muted ? "#a1a1aa" : GREEN }}
            >
              <span aria-hidden="true">
                {muted ? "" : "+"}
                <motion.span data-digits>{text}</motion.span> SOL
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

          {p.status !== "nothing" && p.details && (
            <DetailsToggle
              open={p.details.open}
              controls={p.details.id}
              onToggle={p.details.onToggle}
              animated={!p.reduced}
            />
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2.5 md:items-end">
          {p.status === "nothing" ? (
            <>
              <CheckAgainPill
                onClick={p.watching?.onCheckAnother ?? p.onRescan}
                label={p.watching ? "Check another address" : undefined}
              />
              {p.watching && (
                <Whose
                  address={p.watching.address}
                  className="self-center text-sm text-zinc-500 md:self-end"
                />
              )}
            </>
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
                animated={!p.reduced}
                onClick={p.onReclaim}
                className="px-10 md:min-w-[18rem]"
                label={pillLabel(p)}
              />
              <div className="flex flex-wrap items-baseline justify-center gap-x-3 text-sm text-zinc-500 md:justify-end">
                {p.sending ? (
                  // Empty while it's busy, but the row keeps its height so
                  // the stage doesn't shrink and grow back on a phone.
                  <p aria-hidden="true">{"\u00a0"}</p>
                ) : (
                  <>
                    {p.watching ? (
                      <Whose address={p.watching.address} />
                    ) : (
                      canReclaim && (
                        <p data-fade>{transactionCount(p.transactions)}</p>
                      )
                    )}
                    {(p.watching || canReclaim) && (
                      <span
                        aria-hidden="true"
                        data-fade
                        className="h-3.5 w-px self-center bg-zinc-300"
                      />
                    )}
                    <CheckAgainLink
                      onClick={p.watching?.onCheckAnother ?? p.onRescan}
                      label={p.watching ? "Check another address" : undefined}
                    />
                  </>
                )}
              </div>
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
            // Dimmed as a lighter ring, not as opacity: Motion owns the
            // coin's opacity once it has animated it.
            boxShadow: `inset 0 0 0 1.5px ${dim ? "#e4e4e7" : "#d4d4d8"}`,
          }
        : { backgroundColor: coinColor(coin.id) };
  // Start every coin mid-cycle so the wave is already running, its crest
  // travelling left to right.
  if (waiting) style.animationDelay = `${((index * 45) % 1100) - 1100}ms`;
  return (
    <span
      data-coin
      data-state={coin.state}
      data-coin-color={coinColor(coin.id)}
      className={cn(
        "grid place-content-center text-white",
        size,
        coin.kind === "mint" ? "rounded-[4px]" : "rounded-full",
        animated &&
          "transition-[background-color,box-shadow,opacity] duration-150",
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

/** Whose results these are, for a pasted address. */
function Whose({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  return (
    <p data-fade title={address} className={className}>
      For {compress(address, 4)}
    </p>
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
  if (p.watching) return "Connect to reclaim";
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
    const { transactions, of } = p.failed;
    // The coins say which accounts are left; the sentence needn't count them.
    text =
      of === 1
        ? "That didn't go through. Your accounts are untouched, so you can try again."
        : `${transactions} of ${of} transactions didn't go through. The remaining accounts are untouched, so you can try again.`;
  } else if (p.rejectedAt !== null && !p.busy) {
    tone = "text-zinc-800";
    text = cancelled(p);
  } else {
    text =
      p.status === "ready"
        ? `Available from ${fromWhere(p.tokenAccounts, p.mints)}.`
        : "Select at least one account under Customize.";
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
  if (p.rejectedAt !== null) return cancelled(p);
  return "";
}

function cancelled({ cancelledAfter: after }: RewardProps) {
  return after
    ? `Cancelled after ${after.transactions} of ${after.of} transactions.`
    : "Cancelled in your wallet.";
}
