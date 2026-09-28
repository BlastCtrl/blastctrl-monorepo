import { cubicBezier } from "motion/react";

/**
 * The promo's palette, sampled from promo.mp4 rather than from compressed
 * stills. The pill is the site's own brand red (--color-primary), the ink is
 * slate-800 and the money green is emerald-600.
 */
export const INK = "#1e293b";
export const RED = "#e22424";
export const GREEN = "#059669";

/** The promo's account dots: Tailwind's 400s, in the order the video uses. */
export const COIN_COLORS = [
  "#f472b6",
  "#fbbf24",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f87171",
  "#34d399",
  "#fb923c",
];

export const DOT_GRID =
  "bg-[#fafafa] bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:22px_22px]";

/**
 * The promo's pop, measured at 30 fps: a pill starts near 0.6 scale, passes
 * full size at ~110 ms, peaks 6% over at ~200 ms and rests by ~330 ms. That
 * is a spring with a damping ratio of about 0.5.
 */
export const POP = { type: "spring", stiffness: 380, damping: 20 } as const;

/** For values that carry data (bars, amounts): quick, no overshoot. */
export const SETTLE = { type: "spring", stiffness: 260, damping: 34 } as const;

/**
 * The promo's counter runs slow, fast, slow (its speed is a bell curve,
 * because it follows coins landing). This is that shape, a little softer.
 */
export const COUNT_EASE: [number, number, number, number] = [0.5, 0, 0.3, 1];
const countEase = cubicBezier(...COUNT_EASE);

/**
 * When the counter, running `COUNT_EASE` over `duration` from `start`,
 * passes each of `n` evenly spaced shares of the total. A coin that lands at
 * one of these moments lands exactly as the number takes its share.
 */
export function shareTimes(n: number, start: number, duration: number) {
  const times: number[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k + 0.5) / n;
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 24; step++) {
      const mid = (lo + hi) / 2;
      if (countEase(mid) < target) lo = mid;
      else hi = mid;
    }
    times.push(start + duration * lo);
  }
  return times;
}

/** Stable colour for an account, so a coin keeps its colour across renders. */
export function coinColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COIN_COLORS[hash % COIN_COLORS.length]!;
}
