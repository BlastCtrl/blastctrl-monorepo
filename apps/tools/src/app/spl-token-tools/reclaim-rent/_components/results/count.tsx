import type { MotionValue } from "motion/react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import type { HTMLAttributes } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { formatSol } from "../rent";
import { COUNT_EASE, SETTLE } from "./look";

const formats = new Map<number, Intl.NumberFormat>();
function fixed(lamports: number, digits: number) {
  let format = formats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formats.set(digits, format);
  }
  return format.format(lamports / 1_000_000_000);
}

/**
 * Digits after the point in the resting value, so the count always ends on
 * exactly the string `formatSol` prints everywhere else.
 */
function digitsOf(lamports: number) {
  const text = formatSol(lamports, 5);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export type CountTiming = { delay: number; duration: number };

/**
 * An amount in lamports as text that counts to `target`. On the reveal it
 * starts at zero and runs the promo's slow-fast-slow curve; after that, any
 * new target (someone ticks an account) springs there from wherever the
 * number is, even mid-count. Render it with `CountText`.
 */
export function useCountUp(
  target: number,
  reveal: CountTiming | null,
  reduced: boolean,
) {
  const value = useMotionValue(reveal && !reduced ? 0 : target);
  const digits = useMotionValue(target > 0 ? digitsOf(target) : 5);
  const zero = useMotionValue(target === 0);
  const text = useTransform(() => {
    const v = value.get();
    return zero.get() && v === 0 ? "0" : fixed(v, digits.get());
  });

  // Survive React's double effect run in development: the reveal is timed
  // from the first run, and a second run with the same target resumes it.
  const startedAt = useRef<number | null>(null);
  const lastTarget = useRef(target);
  const settled = useRef(!reveal);
  const delay = reveal?.delay;
  const duration = reveal?.duration;

  useEffect(() => {
    if (target > 0) digits.set(digitsOf(target));
    zero.set(target === 0);
    if (lastTarget.current !== target) settled.current = true;
    lastTarget.current = target;

    if (reduced) {
      value.jump(target);
      return;
    }
    startedAt.current ??= performance.now();
    const elapsed = (performance.now() - startedAt.current) / 1000;
    if (
      !settled.current &&
      delay !== undefined &&
      duration !== undefined &&
      elapsed < delay + duration
    ) {
      const controls = animate(value, target, {
        delay: Math.max(0, delay - elapsed),
        duration,
        ease: COUNT_EASE,
      });
      return () => controls.stop();
    }
    const controls = animate(value, target, SETTLE);
    return () => controls.stop();
  }, [target, reduced, delay, duration, value, digits, zero]);

  return text;
}

/**
 * Shows a counting amount. The text is written straight to the DOM on each
 * frame, so the count never re-renders React, and the span has no React
 * children for a re-render to overwrite. (Motion's `motion.span` could do
 * this too, but it would pull the whole component into the bundle.)
 */
export function CountText({
  text,
  ...props
}: { text: MotionValue<string> } & HTMLAttributes<HTMLSpanElement>) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = text.get();
  }, [text]);
  useMotionValueEvent(text, "change", (latest) => {
    if (ref.current) ref.current.textContent = latest;
  });
  return <span ref={ref} {...props} />;
}
