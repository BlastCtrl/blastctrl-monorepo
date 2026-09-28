import { CheckIcon } from "@heroicons/react/20/solid";
import { SpinnerIcon, cn } from "@blastctrl/ui";
import { animate } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { formatSol } from "../../_components/rent";
import type { Stoppable } from "./effects";
import { popIn } from "./effects";
import { GREEN, INK, POP, RED } from "./look";
import type { RewardProps, RewardStatus } from "./types";
import { fromWhere } from "./types";

type Word = { key: string; text: string; red: boolean };
type Placed = { x: number; y: number; text: string; red: boolean };

/**
 * One word in brand red is marked with an asterisk: "Get your *SOL back.".
 * Each word gets a key from its letters, so two headlines can tell which
 * words they share.
 */
function parse(words: string): Word[] {
  const seen = new Map<string, number>();
  return words.split(" ").map((raw) => {
    const red = raw.startsWith("*");
    const text = red ? raw.slice(1) : raw;
    const base = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: n > 0 ? `${base}-${n}` : base, text, red };
  });
}

function measure(h: HTMLElement) {
  const placed = new Map<string, Placed>();
  h.querySelectorAll<HTMLElement>("[data-word]").forEach((el) => {
    placed.set(el.dataset.key!, {
      x: el.offsetLeft,
      y: el.offsetTop,
      text: el.textContent ?? "",
      red: el.dataset.red === "true",
    });
  });
  return placed;
}

/**
 * A headline as words, so the arrival can pop them one after another. With
 * `morph`, a new headline rearranges the old one: shared words slide to
 * their new places, new words pop in, and the rest drop away. "Get your
 * SOL back." becomes "Your SOL is back." without the SOL ever leaving.
 */
export function Headline({
  words,
  morph = false,
  delay = 0,
}: {
  words: string;
  morph?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const placed = useRef(new Map<string, Placed>());

  // Keep the last known positions fresh if the layout reflows.
  useEffect(() => {
    const h = ref.current;
    if (!h) return;
    const observer = new ResizeObserver(() => {
      placed.current = measure(h);
    });
    observer.observe(h);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return;
    const before = placed.current;
    const now = measure(h);
    placed.current = now;
    if (!morph || before.size === 0) return;

    const running: Stoppable[] = [];
    for (const [key, to] of now) {
      const el = h.querySelector<HTMLElement>(`[data-key="${key}"]`);
      if (!el) continue;
      const from = before.get(key);
      if (!from) {
        el.style.opacity = "0"; // hidden until its pop starts
        running.push(popIn(el, delay + 0.12, { scale: 0.5, y: 14 }));
      } else if (from.x !== to.x || from.y !== to.y) {
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        el.style.transform = `translate(${dx}px, ${dy}px)`; // no flash
        running.push(
          animate(el, { x: [dx, 0], y: [dy, 0] }, { ...POP, delay }),
        );
      }
    }
    // Words the new headline doesn't have fall away from where they were,
    // at once and quickly, so they're gone before a word slides over them.
    for (const [key, from] of before) {
      if (now.has(key)) continue;
      const ghost = document.createElement("span");
      ghost.textContent = from.text;
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "absolute",
        left: `${from.x}px`,
        top: `${from.y}px`,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        color: from.red ? RED : "",
      });
      h.appendChild(ghost);
      const fall = animate(
        ghost,
        { opacity: [1, 0], y: [0, 14], rotate: [0, -10] },
        { duration: 0.14, ease: "easeIn" },
      );
      void fall.then(() => ghost.remove());
      running.push({ stop: () => (fall.stop(), ghost.remove()) });
    }
    return () => running.forEach((r) => r.stop());
  }, [words, morph, delay]);

  return (
    <h2
      ref={ref}
      className="relative font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl"
      style={{ color: INK }}
    >
      {parse(words).map((word, i) => (
        <span key={word.key}>
          {i > 0 && " "}
          <span
            data-word
            data-key={word.key}
            data-red={word.red}
            className="inline-block"
            style={word.red ? { color: RED } : undefined}
          >
            {word.text}
          </span>
        </span>
      ))}
    </h2>
  );
}

/** Headlines for the states other than ready. */
export const SHARED_HEADLINES: Partial<Record<RewardStatus, string>> = {
  "fees-exceed": "Not enough to reclaim yet.",
  nothing: "Nothing to reclaim right now.",
  reclaimed: "Your *SOL is back.",
};

/** The sentence under the headline for the states other than ready. */
export function sharedDetail(p: RewardProps): ReactNode {
  switch (p.status) {
    case "fees-exceed":
      return `The network fee of ${formatSol(p.networkFee)} SOL is more than these accounts hold extra. Rent drops again in November, so check back then.`;
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

/**
 * The brand-red pill, with the ring the arrival sends out from it when the
 * count lands. While a reclaim is in flight it shows a spinner and ignores
 * clicks, but stays focusable so a screen reader keeps its place.
 */
export function ReclaimPill({
  disabled,
  busy = false,
  onClick,
  className,
  children,
}: {
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span data-pill className="relative flex">
      <span
        data-ring
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full opacity-0"
        style={{ outline: `3px solid ${RED}` }}
      />
      <button
        type="button"
        data-pop="button"
        onClick={busy ? undefined : onClick}
        disabled={disabled}
        aria-disabled={busy || undefined}
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-full bg-primary py-4 font-display text-xl font-bold whitespace-nowrap text-white tabular-nums shadow-[0_10px_24px_-8px_rgba(226,36,36,0.6)] transition-[filter,background-color,box-shadow] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus active:translate-y-px disabled:bg-zinc-300 disabled:shadow-none disabled:hover:brightness-100",
          busy && "cursor-progress hover:brightness-100 active:translate-y-0",
          className,
        )}
      >
        {busy && (
          <SpinnerIcon aria-hidden="true" className="size-5 animate-spin" />
        )}
        {children}
      </button>
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
export function CheckAgainPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-pop="button"
      onClick={onClick}
      className="rounded-full border-2 px-8 py-3 font-display text-lg font-bold transition-[background-color] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: INK, color: INK }}
    >
      Check again
    </button>
  );
}

export function CheckAgainLink({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
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
      Check again
    </button>
  );
}
