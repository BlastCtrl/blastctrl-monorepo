"use client";

import {
  ORIGINAL_LAMPORTS_PER_BYTE,
  TOKEN_ACCOUNT_SIZE,
  formatSol,
  minimumBalance,
} from "@/app/spl-token-tools/reclaim-rent/_components/rent";
import {
  Chips,
  ReclaimPill,
} from "@/app/spl-token-tools/reclaim-rent/_components/results/bits";
import { Stage } from "@/app/spl-token-tools/reclaim-rent/_components/results/stage";
import { useRentRate } from "@/app/spl-token-tools/reclaim-rent/_components/use-rent-rate";
import { cn } from "@blastctrl/ui";
import type { ReactNode } from "react";

/**
 * The results block's height with one row of coins and no "Customize",
 * from Tally's Tailwind sizes (and measured), so the invitation holds the
 * band at the height the results will need. Keep in step with Tally.
 *   Amount column: amount (48px, 60px from sm) + coins (16 + 12px, 14px
 *   from sm) + sentence (12 + 20px) + chips (20 + 32px) = 160px, 174px.
 *   Pill column: pill (32 + 28px) + gap (10px) + its line (20px) = 90px.
 *   Below md the columns stack with a 32px gap.
 */
const RESULTS_HEIGHT = "min-h-[282px] sm:min-h-[296px] md:min-h-[174px]";

/**
 * The tool's stage run edge to edge across the page: the dot-grid band the
 * whole reclaim happens on, from the first click to the green badge. Its
 * content keeps to the page's column.
 */
export function Band({
  moving,
  reduced,
  children,
}: {
  moving: boolean;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Reclaim"
      className="border-t border-zinc-200 px-4 sm:px-6"
    >
      <Stage moving={moving} reduced={reduced}>
        <div className="mx-auto max-w-[60rem]">{children}</div>
      </Stage>
    </section>
  );
}

/**
 * What the band says before the first scan: what one account gives back,
 * and the pill to find out the rest. Laid out like the results that replace
 * it, so the pill is where "Reclaim it" will be, and the band keeps its
 * height. While the scan runs it stays, invisible, to hold that height.
 */
export function Invitation({
  connected,
  checking,
  failed,
  reduced,
  onCheck,
}: {
  connected: boolean;
  checking: boolean;
  failed: boolean;
  reduced: boolean;
  onCheck: () => void;
}) {
  const { lamportsPerByte } = useRentRate();
  const paid = minimumBalance(TOKEN_ACCOUNT_SIZE, ORIGINAL_LAMPORTS_PER_BYTE);
  const excess = paid - minimumBalance(TOKEN_ACCOUNT_SIZE, lamportsPerByte);

  return (
    <div
      aria-hidden={checking || undefined}
      inert={checking}
      className={cn(
        "flex flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-12",
        RESULTS_HEIGHT,
        checking && "invisible",
      )}
    >
      <div className="min-w-0 md:max-w-xl">
        <h2 className="font-display text-xl font-bold text-balance text-slate-800 sm:text-2xl">
          About {formatSol(excess, 5)} SOL back from every token account.
        </h2>
        <p className="mt-3 max-w-md text-sm text-pretty text-zinc-600">
          Empty ones return their whole {formatSol(paid, 5)} SOL deposit. Active
          wallets often have dozens.
        </p>
        <Chips closesEmpty />
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2.5 md:items-end">
        <ReclaimPill
          disabled={false}
          animated={!reduced}
          onClick={onCheck}
          className="px-10 md:min-w-[18rem]"
          label={connected ? "Check my wallet" : "Connect wallet"}
        />
        {failed ? (
          <p role="alert" className="text-center text-sm text-red-700">
            Couldn&apos;t load your token accounts. Try again in a moment.
          </p>
        ) : (
          <p className="text-center text-sm text-zinc-500 md:self-center">
            Free to check. Nothing moves until you approve.
          </p>
        )}
      </div>
    </div>
  );
}
