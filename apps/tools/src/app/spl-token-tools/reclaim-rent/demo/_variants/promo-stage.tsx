import { CheckIcon } from "@heroicons/react/20/solid";
import { formatSol } from "../../_components/rent";
import {
  DOT_GRID,
  GREEN,
  INK,
  POP_KEYFRAMES,
  RED,
  RED_DARK,
} from "./promo.css";
import type { VariantProps } from "./types";
import { count, fromWhere } from "./types";

/**
 * The video's closing frame as a section: dot-grid stage, a slab headline
 * with one red word, the amount in green with a plus sign, the two check
 * chips, and the brand-red pill on the right. The amount pops in once.
 */
export function PromoStageVariant(p: VariantProps) {
  return (
    <div
      className={`-mx-4 border-b border-zinc-200 px-4 py-9 sm:-mx-6 sm:px-8 sm:py-10 ${DOT_GRID}`}
    >
      <style>{POP_KEYFRAMES}</style>
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-7">
        <div className="max-w-md">
          <h2
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: INK }}
          >
            Get your <span style={{ color: RED }}>SOL</span> back.
          </h2>
          <p
            className="promo-pop mt-4 font-display text-4xl font-bold tabular-nums sm:text-5xl"
            style={{ color: GREEN }}
          >
            +{formatSol(p.net, 5)} SOL
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            From {fromWhere(p)}, in {count(p.transactions, "transaction")},
            after a {p.serviceFeeRate} fee.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip>Tokens stay</Chip>
            <Chip>Nothing closed</Chip>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <button
            type="button"
            onClick={p.onReclaim}
            disabled={p.total === 0}
            className="rounded-full px-10 py-4 font-display text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(214,57,47,0.6)] transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:bg-zinc-300 disabled:shadow-none"
            style={{ backgroundColor: RED, outlineColor: RED_DARK }}
          >
            Reclaim it
          </button>
          <button
            type="button"
            onClick={p.onRescan}
            className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
          >
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[#dcf5e6] px-3 py-1.5 text-sm font-medium"
      style={{ color: "#1f6b45" }}
    >
      <CheckIcon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
}
