"use client";

import { cn } from "@blastctrl/ui";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { DOT_GRID } from "./look";

/** One tile of the dot grid; drifting by a whole tile looks like no change. */
const TILE = 22;
/** How fast the dots drift while the scan runs, in px per second per axis. */
const DRIFT = 12;
/** How quickly the drift picks up and dies away, in ms. */
const EASE_MS = 180;

/**
 * The height of Tally with one row of coins, from its Tailwind sizes. Keep
 * in step with Tally's layout.
 *   Amount column: amount (48px, 60px from sm) + coins (16 + 12px, 14px
 *   from sm) + sentence (12 + 20px) + chips (20 + 32px) + "Choose
 *   accounts" pill (16 + 34px) = 210px, 224px.
 *   Pill column: pill (56px) + gap (10px) + count row (20px) = 86px.
 *   Below md the columns stack with a 32px gap; from md they sit side by
 *   side and the amount column is the taller.
 */
const EMPTY_HEIGHT = "min-h-[328px] sm:min-h-[342px] md:min-h-[224px]";

/** "Checking…" rises in from below and leaves upwards, a few px each way. */
const CHECKING = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/** The band unrolls from the top as it appears. */
const STAGE_CSS = `
  @keyframes stage-in {
    from { opacity: 0; clip-path: inset(0 0 100% 0); }
  }
  .stage-in { animation: stage-in 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
`;

/**
 * The off-white dot-grid band the results sit on. It appears the moment the
 * scan starts with a small "Checking…" in the middle, and while `moving` its
 * dots drift slowly up and to the left, picking up speed and then easing to
 * a stop when the scan is done, as "Checking…" leaves.
 * Until something is inside, it holds exactly the height of a typical
 * result (one row of coins, so up to ~30 accounts), so the results land
 * without the stage changing size. Bigger wallets grow it by their extra
 * coin rows.
 */
export function Stage({
  moving,
  last = false,
  reduced,
  children,
}: {
  moving: boolean;
  /**
   * Nothing follows the stage in the card: no bottom rule (it would double
   * the card's edge), and its corners round off with the card's.
   */
  last?: boolean;
  reduced: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const speed = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let last: number | null = null;
    let id = 0;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(64, now - last);
      last = now;
      // Ease towards the target speed: full drift while moving, none after.
      const target = moving ? DRIFT : 0;
      speed.current += (target - speed.current) * (1 - Math.exp(-dt / EASE_MS));
      if (!moving && speed.current < 0.2) {
        speed.current = 0;
        return;
      }
      offset.current = (offset.current + (speed.current * dt) / 1000) % TILE;
      el.style.backgroundPosition = `${-offset.current}px ${-offset.current}px`;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [moving, reduced]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative -mx-4 px-4 py-9 sm:-mx-6 sm:px-8 sm:py-11",
        last ? "sm:rounded-b-lg" : "border-b border-zinc-200",
        DOT_GRID,
        !reduced && "stage-in",
      )}
    >
      <style>{STAGE_CSS}</style>
      <div className={cn(!children && EMPTY_HEIGHT)}>{children}</div>

      {/* While the scan runs, a small "Checking…" sits in the middle. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <AnimatePresence>
          {moving && (
            <motion.div
              key="checking"
              role="status"
              {...CHECKING}
              initial={reduced ? false : CHECKING.initial}
              transition={
                reduced ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }
              }
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-600 ring-1 ring-zinc-100"
            >
              Checking…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
