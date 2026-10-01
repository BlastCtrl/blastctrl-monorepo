import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Stoppable } from "./effects";

export type ArrivalContext = {
  root: HTMLElement;
  /** Overlay for coins, the size of `root`. */
  layer: HTMLElement;
  /** Delay until `t` seconds on the arrival's clock. */
  at: (t: number) => number;
  all: (selector: string) => Element[];
  one: (selector: string) => Element | null;
};

export type Arrival = {
  /** Elements hidden before the first paint, for the arrival to bring in. */
  hide: string;
  /** When the last animation has settled, in seconds. */
  end: number;
  run: (ctx: ArrivalContext) => Stoppable[];
};

/**
 * Plays an arrival once, when the results mount. Elements are hidden in a
 * layout effect, so nothing flashes before the first frame, and nothing but
 * unmounting stops the animations: a tab in the background just pauses
 * them, and they finish when it comes back. The clock starts on the first
 * run, so React's double effect run in development resumes the same
 * arrival instead of starting a second one.
 *
 * Returns a function that tells effects whether the arrival is still
 * playing, so they can keep out of its way.
 */
export function useArrival(
  rootRef: RefObject<HTMLElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  play: boolean,
  arrival: Arrival,
) {
  const startedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!play || !root || startedAt.current !== null) return;
    root.querySelectorAll<HTMLElement>(arrival.hide).forEach((el) => {
      el.style.opacity = "0";
    });
  }, [play, arrival, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!play || !root || !layer) return;
    startedAt.current ??= performance.now();
    const past = (performance.now() - startedAt.current) / 1000;
    const running = arrival.run({
      root,
      layer,
      at: (t) => Math.max(0, t - past),
      all: (selector) => [...root.querySelectorAll(selector)],
      one: (selector) => root.querySelector(selector),
    });
    return () => running.forEach((r) => r.stop());
  }, [play, arrival, rootRef, layerRef]);

  return useCallback(
    () =>
      startedAt.current !== null &&
      performance.now() - startedAt.current < arrival.end * 1000,
    [arrival],
  );
}
