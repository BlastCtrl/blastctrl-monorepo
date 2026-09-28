import { formatSol } from "../../_components/rent";
import {
  DOT_GRID,
  GREEN,
  HATCH,
  INK,
  POP_KEYFRAMES,
  RED,
  RED_DARK,
} from "./promo.css";
import type { VariantProps } from "./types";
import { Count, fromWhere } from "./types";

/**
 * The video's deposit card, filled with the wallet's real totals. Headline
 * on the left, the card on the right with the navy "holds" bar, the green
 * "needs" bar with the red-hatched excess, and the red pill as the card's
 * footer. The bars fill and the pill pops in once.
 */
export function PromoCardVariant(p: VariantProps) {
  const neededShare = p.held > 0 ? (p.needed / p.held) * 100 : 0;

  return (
    <div
      className={`rounded-2xl border border-zinc-200 px-6 py-7 sm:px-8 sm:py-8 ${DOT_GRID}`}
    >
      <style>{POP_KEYFRAMES}</style>
      <div className="grid items-center gap-x-10 gap-y-7 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div>
          <h2
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: INK }}
          >
            Your accounts are <span style={{ color: RED }}>overpaying.</span>
          </h2>
          <p className="mt-4 max-w-sm text-base text-zinc-600">
            {fromWhere(p)} hold {formatSol(p.total, 5)} SOL more than the rent
            they need. Nothing moves except the SOL.
          </p>
          <button
            type="button"
            onClick={p.onRescan}
            className="mt-4 text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
          >
            Check again
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_12px_40px_-16px_rgba(27,34,50,0.35)]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold" style={{ color: INK }}>
              Deposit they hold
            </span>
            <span
              className="font-display text-lg font-bold tabular-nums"
              style={{ color: INK }}
            >
              {formatSol(p.held, 5)}
            </span>
          </div>
          <div
            className="promo-grow mt-2 h-4 w-full rounded-full"
            style={{ backgroundColor: INK }}
          />

          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-sm font-semibold" style={{ color: INK }}>
              Rent needed now
            </span>
            <span
              className="font-display text-lg font-bold tabular-nums"
              style={{ color: GREEN }}
            >
              {formatSol(p.needed, 5)}
            </span>
          </div>
          <div className="mt-2 flex h-4 w-full">
            <div
              className="promo-grow h-full rounded-l-full"
              style={{ width: `${neededShare}%`, backgroundColor: GREEN }}
            />
            <div
              className={`h-full grow rounded-r-full border border-dashed ${HATCH}`}
              style={{ borderColor: RED }}
            />
          </div>

          <button
            type="button"
            onClick={p.onReclaim}
            disabled={p.total === 0}
            className="promo-pop mt-6 w-full rounded-full px-6 py-4 font-display text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(214,57,47,0.6)] transition [animation-delay:0.7s] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:bg-zinc-300 disabled:shadow-none"
            style={{ backgroundColor: RED, outlineColor: RED_DARK }}
          >
            Reclaim +{formatSol(p.net, 5)} SOL
          </button>
          <p className="mt-2 text-center text-xs text-zinc-500">
            {Count(p.transactions, "transaction")}, after a {p.serviceFeeRate}{" "}
            fee
          </p>
        </div>
      </div>
    </div>
  );
}
