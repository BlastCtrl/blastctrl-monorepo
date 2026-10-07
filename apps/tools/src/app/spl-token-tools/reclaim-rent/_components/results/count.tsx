import { animate, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { formatSol } from "../rent";
import { SETTLE } from "./look";

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

/**
 * An amount in lamports as text that counts to `target`. With `fromZero`
 * it starts at zero and leaves the first count to the arrival's timeline,
 * which animates `value`; after that, any new target (someone ticks an
 * account) springs there from wherever the number is, even mid-count.
 * Render `text` as the child of a `motion.span`, so it updates without
 * re-rendering.
 */
export function useCountUp(
  target: number,
  fromZero: boolean,
  reduced: boolean,
) {
  const value = useMotionValue(fromZero ? 0 : target);
  const digits = useMotionValue(target > 0 ? digitsOf(target) : 5);
  const zero = useMotionValue(target === 0);
  const text = useTransform(() => {
    const v = value.get();
    return zero.get() && v === 0 ? "0" : fixed(v, digits.get());
  });

  const lastTarget = useRef(target);
  useEffect(() => {
    if (target === lastTarget.current) return;
    lastTarget.current = target;
    if (target > 0) digits.set(digitsOf(target));
    zero.set(target === 0);
    if (reduced) {
      value.jump(target);
      return;
    }
    const controls = animate(value, target, SETTLE);
    return () => controls.stop();
  }, [target, reduced, value, digits, zero]);

  return { text, value };
}
