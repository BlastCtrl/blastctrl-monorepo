import { CheckIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import { SpinnerIcon, cn } from "@blastctrl/ui";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { GREEN, INK, SETTLE } from "./look";
import type { RewardProps, RewardStatus } from "./types";
import { fromWhere } from "./types";

/** A headline as words, so the arrival can pop them one after another. */
export function Headline({ words }: { words: string }) {
  return (
    <h2
      className="font-display text-2xl font-bold text-balance"
      style={{ color: INK }}
    >
      {words.split(" ").map((word, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span data-word className="inline-block">
            {word}
          </span>
        </span>
      ))}
    </h2>
  );
}

/**
 * Only the states without an amount get a headline; everywhere else the
 * amount leads the block.
 */
export const HEADLINES: Partial<Record<RewardStatus, string>> = {
  "fees-exceed": "Not enough to reclaim yet.",
  nothing: "Nothing to reclaim right now.",
};

/** The sentence under the headline for the states other than ready. */
export function sharedDetail(p: RewardProps): ReactNode {
  switch (p.status) {
    case "fees-exceed":
      return "The fees are more than these accounts hold extra. Rent drops again in November, so check back then.";
    case "nothing":
      return "Every account in this wallet is already at the minimum. Rent drops again in November, so check back then.";
    case "reclaimed":
      return `Sent to your wallet from ${fromWhere(p.reclaimedFrom.tokenAccounts, p.reclaimedFrom.mints)}.`;
    default:
      return null;
  }
}

/** What the reclaim promises. Only claims closing when there's an empty one. */
export function Chips({ closesEmpty }: { closesEmpty: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Chip>Tokens stay</Chip>
      {closesEmpty && <Chip>Empty accounts closed</Chip>}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      data-pop="chip"
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800"
    >
      <CheckIcon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
}

/** A label leaves upwards and the next comes in from below, each over a
 * few px, blurred a touch so the two read as one change rather than two
 * things swapping. Out is quicker than in. */
const LABEL = {
  initial: { opacity: 0, y: 8, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(2px)" },
};
const LABEL_EASE = [0.23, 1, 0.32, 1] as const;
const LABEL_IN = { duration: 0.2, ease: LABEL_EASE };
const LABEL_OUT = { duration: 0.12, ease: LABEL_EASE };
const AT_ONCE = { duration: 0 };

/**
 * The brand-red pill. While a reclaim is in flight it shows a spinner and
 * ignores clicks, but stays focusable so a screen reader keeps its place.
 * Its label changes as the reclaim moves along: each change crossfades,
 * and the pill's width follows the new label instead of jumping to it.
 */
export function ReclaimPill({
  disabled,
  busy = false,
  animated,
  onClick,
  className,
  label,
}: {
  disabled: boolean;
  busy?: boolean;
  animated: boolean;
  onClick: () => void;
  className?: string;
  label: string;
}) {
  return (
    <span data-pill className="relative flex">
      <motion.button
        type="button"
        data-pop="button"
        layout={animated}
        transition={{ layout: SETTLE }}
        onClick={busy ? undefined : onClick}
        disabled={disabled}
        aria-disabled={busy || undefined}
        className={cn(
          "relative flex w-full items-center justify-center rounded-full bg-primary py-4 font-display text-xl font-bold whitespace-nowrap text-white tabular-nums shadow-[0_10px_24px_-8px_rgba(226,36,36,0.6)] transition-[filter,background-color,box-shadow] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus active:translate-y-px disabled:bg-zinc-300 disabled:shadow-none disabled:hover:brightness-100",
          busy && "cursor-progress hover:brightness-100 active:translate-y-0",
          className,
        )}
      >
        {/* The leaving label is taken out of the flow at once, so the pill
            can size to the new one while the old one fades. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            // In the layout tree too, so the pill's size change doesn't
            // stretch the text while it plays.
            layout={animated ? "position" : false}
            className="flex items-center gap-2.5"
            initial={animated ? LABEL.initial : false}
            animate={LABEL.animate}
            exit={{
              ...LABEL.exit,
              transition: animated ? LABEL_OUT : AT_ONCE,
            }}
            transition={animated ? LABEL_IN : AT_ONCE}
          >
            {busy && (
              <SpinnerIcon aria-hidden="true" className="size-5 animate-spin" />
            )}
            {label}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </span>
  );
}

/**
 * What the pill turns into once the SOL is in the wallet: green, with a
 * check, and a ring of its own for the moment it appears.
 */
export function ReclaimedBadge({ className }: { className?: string }) {
  return (
    <span className="relative flex">
      <span
        data-ring-done
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full opacity-0"
        style={{ outline: `3px solid ${GREEN}` }}
      />
      <span
        data-pop="button"
        data-badge
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-full py-4 font-display text-xl font-bold text-white shadow-[0_10px_24px_-8px_rgba(5,150,105,0.55)]",
          className,
        )}
        style={{ backgroundColor: GREEN }}
      >
        <CheckIcon aria-hidden="true" className="size-6" />
        Reclaimed
      </span>
    </span>
  );
}

/** "Check again" as a quiet outline pill, for when there's nothing to take. */
export function CheckAgainPill({
  onClick,
  label = "Check again",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-pop="button"
      onClick={onClick}
      className="rounded-full border-2 px-8 py-3 font-display text-lg font-bold transition-[background-color] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: INK, color: INK }}
    >
      {label}
    </button>
  );
}

export function CheckAgainLink({
  onClick,
  className,
  label = "Check again",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-fade
      onClick={onClick}
      className={cn(
        "text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800",
        className,
      )}
    >
      {label}
    </button>
  );
}

/**
 * Opens and closes the detailed view below the stage, where the person
 * picks exactly which token accounts and mints to reclaim from. A neutral
 * outline pill under the green chips, so it reads as a button rather than
 * another statement; the chevron flips when it's open.
 */
export function DetailsToggle({
  open,
  controls,
  onToggle,
  animated,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
  animated: boolean;
}) {
  return (
    <div data-fade className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white py-1.5 pr-3 pl-3.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        Customize
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 text-zinc-400",
            animated && "transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}
