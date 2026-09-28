import { CheckIcon } from "@heroicons/react/20/solid";
import type { CSSProperties } from "react";
import { formatSol } from "../_components/rent";
import {
  DOT_GRID,
  GREEN,
  INK,
  RED,
  RED_DARK,
} from "../demo/_variants/promo.css";
import type { VariantProps } from "../demo/_variants/types";
import { count, fromWhere } from "../demo/_variants/types";

/** Position in the reveal sequence, read by the staggered modes. */
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * The Stage variant with reveal hooks: every element that should be able
 * to arrive on its own carries `data-reveal` and its place in the sequence.
 * Elements marked `data-reveal="pop"` are the ones the combined mode pops.
 */
export function StageAnimated(p: VariantProps) {
  return (
    <div
      className={`-mx-4 border-b border-zinc-200 px-4 py-9 sm:-mx-6 sm:px-8 sm:py-10 ${DOT_GRID}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-7">
        <div className="max-w-md">
          <h2
            data-reveal
            style={{ ...at(0), color: INK }}
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl"
          >
            Get your <span style={{ color: RED }}>SOL</span> back.
          </h2>
          <p
            data-reveal="pop"
            style={{ ...at(1), color: GREEN }}
            className="mt-4 origin-left font-display text-4xl font-bold tabular-nums sm:text-5xl"
          >
            +{formatSol(p.net, 5)} SOL
          </p>
          <p data-reveal style={at(2)} className="mt-2 text-sm text-zinc-500">
            From {fromWhere(p)}, in {count(p.transactions, "transaction")},
            after a {p.serviceFeeRate} fee.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip index={3}>Tokens stay</Chip>
            <Chip index={4}>Nothing closed</Chip>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <button
            type="button"
            data-reveal="pop"
            style={{ ...at(5), backgroundColor: RED, outlineColor: RED_DARK }}
            onClick={p.onReclaim}
            disabled={p.total === 0}
            className="rounded-full px-10 py-4 font-display text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(214,57,47,0.6)] transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:bg-zinc-300 disabled:shadow-none"
          >
            Reclaim it
          </button>
          <button
            type="button"
            data-reveal
            style={at(6)}
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

function Chip({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <span
      data-reveal
      style={{ ...at(index), color: "#1f6b45" }}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#dcf5e6] px-3 py-1.5 text-sm font-medium"
    >
      <CheckIcon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
}
