import type { DynamicOption } from "motion/react";
import { animate, stagger } from "motion/react";
import { COIN_COLORS, POP } from "./look";

type Point = { x: number; y: number };
type Targets = Element | Element[] | NodeListOf<Element>;

/** Anything that can be stopped: Motion's controls, or a coin. */
export type Stoppable = { stop: () => void };

const NOTHING: Stoppable = { stop: () => {} };

/** Motion throws on an empty list; a state without chips has none to pop. */
const empty = (targets: Targets) =>
  !(targets instanceof Element) && targets.length === 0;

/** Centre of `el`, in the coordinate space of `layer`. */
export function centerIn(layer: Element, el: Element): Point {
  const a = layer.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
}

/** A random point inside `el`, in the coordinate space of `layer`. */
export function pointIn(
  layer: Element,
  el: Element,
  { x = [0, 1], y = [0, 1] }: { x?: number[]; y?: number[] } = {},
): Point {
  const a = layer.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const rx = x[0]! + Math.random() * (x[1]! - x[0]!);
  const ry = y[0]! + Math.random() * (y[1]! - y[0]!);
  return {
    x: b.left - a.left + b.width * rx,
    y: b.top - a.top + b.height * ry,
  };
}

/**
 * The promo's pop: in from a smaller scale with a springy overshoot. The
 * elements start hidden (see `useArrival`).
 */
export function popIn(
  targets: Targets,
  delay: number | DynamicOption<number>,
  { scale = 0.6, y = 0 }: { scale?: number; y?: number } = {},
): Stoppable {
  if (empty(targets)) return NOTHING;
  return animate(
    targets,
    { opacity: [0, 1], scale: [scale, 1], y: [y, 0] },
    { ...POP, delay },
  );
}

/** Plain fade for the quiet parts: fine print, the tables below. */
export function fadeIn(
  targets: Targets,
  delay: number,
  duration = 0.25,
): Stoppable {
  if (empty(targets)) return NOTHING;
  return animate(targets, { opacity: [0, 1] }, { delay, duration });
}

/**
 * A bump that says "this just changed": up a few percent, then back with a
 * small dip below full size, like something heavy landing.
 */
export function pulse(el: Element, delay: number, amount = 0.07) {
  return animate(
    el,
    { scale: [1, 1 + amount, 1] },
    {
      delay,
      duration: 0.32,
      times: [0, 0.35, 1],
      ease: ["easeOut", [0.35, 1.35, 0.6, 1]],
    },
  );
}

/**
 * The ring the promo's closing logo sends out, drawn as an outline so it
 * keeps an even gap around a pill. It thins and fades as it grows. The
 * first keyframe is invisible because Motion shows it during the delay.
 */
export function ringOut(el: Element, delay: number) {
  return animate(
    el,
    {
      outlineOffset: ["0px", "0px", "18px"],
      outlineWidth: ["3px", "3px", "1px"],
      opacity: [0, 0.7, 0],
    },
    {
      delay,
      duration: 0.45,
      times: [0, 0.04, 1],
      ease: ["linear", [0.15, 0.7, 0.3, 1]],
    },
  );
}

/**
 * A small coin that flies from `from` to `to` along a quadratic curve bent
 * through `via`, then vanishes into its target. Lives in `layer`, an
 * absolutely positioned overlay, and removes itself when done.
 */
export function flyCoin(
  layer: HTMLElement,
  from: Point,
  via: Point,
  to: Point,
  {
    delay,
    duration,
    color,
    size = 7,
  }: {
    delay: number;
    duration: number;
    color: string;
    size?: number;
  },
): Stoppable {
  const el = document.createElement("span");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "absolute",
    left: `${-size / 2}px`,
    top: `${-size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    background: color,
    opacity: "0",
    pointerEvents: "none",
    willChange: "transform, opacity",
  });
  layer.appendChild(el);

  const controls = animate(0, 1, {
    delay,
    duration,
    ease: "easeOut",
    onUpdate: (p) => {
      const q = 1 - p;
      const x = q * q * from.x + 2 * q * p * via.x + p * p * to.x;
      const y = q * q * from.y + 2 * q * p * via.y + p * p * to.y;
      // Shrinks and fades over the last stretch, as if sinking in.
      const scale = p < 0.6 ? 1 : 1 - ((p - 0.6) / 0.4) * 0.7;
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      el.style.opacity = String(
        p < 0.08 ? p / 0.08 : p > 0.7 ? (1 - p) / 0.3 : 1,
      );
    },
    onComplete: () => el.remove(),
  });
  // Stopping early (unmount, replay) must not leave coins behind.
  return {
    stop: () => {
      controls.stop();
      el.remove();
    },
  };
}

/**
 * A coin turning over to its other face: in from edge-on, with the pop's
 * overshoot. Its new colour is already set, so it lands showing it.
 */
export function flipIn(el: Element, delay: number): Stoppable {
  return animate(el, { scaleX: [0, 1] }, { ...POP, delay });
}

/** A hop that ripples through a row, one element after the next. */
export function hop(
  targets: Element[],
  delay: number,
  height = 4,
  total = 0.4,
): Stoppable {
  if (targets.length === 0) return NOTHING;
  return animate(
    targets,
    { y: [0, -height, 0] },
    {
      duration: 0.34,
      times: [0, 0.4, 1],
      ease: ["easeOut", "easeIn"],
      delay: stagger(Math.min(0.02, total / targets.length), {
        startDelay: delay,
      }),
    },
  );
}

/**
 * One burst of the promo's account dots from around an element's edge:
 * they fly outward in an arc and fall a little, like something just popped
 * open, without crossing the element itself.
 */
export function burst(
  layer: HTMLElement,
  el: Element,
  delay: number,
  count = 16,
): Stoppable {
  const a = layer.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const cx = b.left - a.left + b.width / 2;
  const cy = b.top - a.top + b.height / 2;
  const running: Stoppable[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const from = { x: cx + (cos * b.width) / 2, y: cy + (sin * b.height) / 2 };
    const distance = 22 + Math.random() * 26;
    running.push(
      flyCoin(
        layer,
        from,
        {
          x: from.x + cos * distance * 0.7,
          y: from.y + sin * distance * 0.7 - 12,
        },
        { x: from.x + cos * distance, y: from.y + sin * distance + 10 },
        {
          delay: delay + Math.random() * 0.04,
          duration: 0.5 + Math.random() * 0.15,
          color: COIN_COLORS[i % COIN_COLORS.length]!,
          size: 6 + Math.round(Math.random() * 3),
        },
      ),
    );
  }
  return { stop: () => running.forEach((r) => r.stop()) };
}

/** "No": a short shake, left and right, settling back in place. */
export function shake(el: Element): Stoppable {
  return animate(
    el,
    { x: [0, -9, 8, -6, 4, -2, 0] },
    { duration: 0.45, ease: "easeOut" },
  );
}
