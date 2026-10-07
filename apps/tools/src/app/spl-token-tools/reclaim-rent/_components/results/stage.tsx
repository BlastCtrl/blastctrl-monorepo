"use client";

import { cn } from "@blastctrl/ui";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { DOT_GRID, STAGE_BG } from "./look";

/** One tile of the dot grid; drifting by a whole tile looks like no change. */
const TILE = 22;
/** How fast the dots drift while the scan runs, in px per second per axis. */
const DRIFT = 12;

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
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** In at an easy pace; out fast, so it's gone before the results pop in. */
const CHECKING_IN = { duration: 0.2, ease: EASE_OUT };
const CHECKING_OUT = { duration: 0.12, ease: EASE_OUT };
const AT_ONCE = { duration: 0 };

/**
 * The band unrolls from the top as it appears. Its dots drift up and to
 * the left by one tile per cycle, which joins up with itself; the drift is
 * paused rather than stopped, so it can pick up again from where it is.
 * The media query covers a server-rendered stage, painted before the page
 * knows the setting.
 */
const STAGE_CSS = `
  @keyframes stage-in {
    from { opacity: 0; clip-path: inset(0 0 100% 0); }
  }
  .stage-in { animation: stage-in 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @keyframes stage-drift {
    to { transform: translate(${-TILE}px, ${-TILE}px); }
  }
  .stage-drift { animation: stage-drift ${TILE / DRIFT}s linear infinite; }
  @media (prefers-reduced-motion: reduce) {
    .stage-in, .stage-drift { animation: none; }
  }
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
  return (
    <div
      className={cn(
        "relative -mx-4 px-4 py-9 sm:-mx-6 sm:px-8 sm:py-11",
        last ? "sm:rounded-b-lg" : "border-b border-zinc-200",
        STAGE_BG,
        !reduced && "stage-in",
      )}
    >
      <style>{STAGE_CSS}</style>
      {/* The dot grid on a layer of its own, one tile oversize, so the
          drift is a transform and not a repaint of the whole band. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <div
          className={cn(
            "absolute top-0 left-0 h-[calc(100%+22px)] w-[calc(100%+22px)] will-change-transform",
            DOT_GRID,
            !reduced && "stage-drift",
          )}
          style={{ animationPlayState: moving ? "running" : "paused" }}
        />
      </div>
      <div className={cn("relative", !children && EMPTY_HEIGHT)}>
        {children}
      </div>

      {/* While the scan runs, a small "Checking…" sits in the middle. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <AnimatePresence>
          {moving && (
            <motion.div
              key="checking"
              role="status"
              initial={reduced ? false : CHECKING.initial}
              animate={CHECKING.animate}
              exit={{
                ...CHECKING.exit,
                transition: reduced ? AT_ONCE : CHECKING_OUT,
              }}
              transition={reduced ? AT_ONCE : CHECKING_IN}
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
