import type {
  DOMKeyframesDefinition,
  ElementOrSelector,
  Segment,
  SegmentTransitionOptions,
} from "motion/react";
import { animate } from "motion/react";
import { COIN_COLORS, POP } from "./look";

type Point = { x: number; y: number };

/** Anything that can be stopped: Motion's controls, a flight, a timer. */
export type Stoppable = { stop: () => void };

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

/*
 * The choreographed moments (the arrival, the payoff) are Motion sequences:
 * one timeline each, with every step at an absolute time. The effects
 * below are steps for those timelines.
 */

export type Effect = {
  keyframes: DOMKeyframesDefinition;
  transition: SegmentTransitionOptions;
};

/** `effect` on `subject`, `at` seconds into the sequence. */
export function step(
  subject: ElementOrSelector,
  { keyframes, transition }: Effect,
  at: number,
  more: SegmentTransitionOptions = {},
): Segment {
  return [subject, keyframes, { ...transition, ...more, at }];
}

/**
 * The promo's pop: in from a smaller scale with a springy overshoot. In a
 * sequence the first keyframe holds from the start, so the element is
 * hidden until its moment.
 */
export const popIn = (scale = 0.6, y = 0): Effect => ({
  keyframes: { opacity: [0, 1], scale: [scale, 1], y: [y, 0] },
  transition: POP,
});

/** Plain fade for the quiet parts: fine print, the tables below. */
export const FADE_IN: Effect = {
  keyframes: { opacity: [0, 1] },
  transition: { duration: 0.25 },
};

/**
 * A bump that says "this just changed": up a few percent, then back with a
 * small dip below full size, like something heavy landing.
 */
export const pulse = (amount = 0.07): Effect => ({
  keyframes: { scale: [1, 1 + amount, 1] },
  transition: {
    duration: 0.32,
    times: [0, 0.35, 1],
    ease: ["easeOut", [0.35, 1.35, 0.6, 1]],
  },
});

/**
 * The ring the promo's closing logo sends out, drawn as an outline so it
 * keeps an even gap around a pill. It thins and fades as it grows. The
 * first keyframe is invisible, since it holds until the ring's moment.
 */
export const RING_OUT: Effect = {
  keyframes: {
    outlineOffset: ["0px", "0px", "18px"],
    outlineWidth: ["3px", "3px", "1px"],
    opacity: [0, 0.7, 0],
  },
  transition: {
    duration: 0.45,
    times: [0, 0.04, 1],
    ease: ["linear", [0.15, 0.7, 0.3, 1]],
  },
};

/** A hop that ripples through a row; stagger it per element. */
export const HOP: Effect = {
  keyframes: { y: [0, -4, 0] },
  transition: {
    duration: 0.34,
    times: [0, 0.4, 1],
    ease: ["easeOut", "easeIn"],
  },
};

/*
 * Single effects, for when one thing changes state.
 */

/**
 * The pop for something already on screen: a kick from `from` back to full
 * size, with no fade, so a coin that changes state never blinks out.
 */
export function pop(el: Element, delay: number, from: number): Stoppable {
  return animate(el, { scale: [from, 1] }, { ...POP, delay });
}

/**
 * The first half of a coin turning over: its old face narrows to edge-on,
 * speeding up as it goes. Resolves when the coin is edge-on, so the new
 * face can be set and `flipIn` can take over.
 */
export function flipOut(el: Element, delay: number): Promise<void> {
  return animate(
    el,
    { scaleX: [1, 0] },
    { delay, duration: 0.08, ease: "easeIn" },
  ).then(() => {});
}

/**
 * The second half: the new face comes in from edge-on, with the pop's
 * overshoot. The new colour must already be set when this starts.
 */
export function flipIn(el: Element, delay: number): Stoppable {
  return animate(el, { scaleX: [0, 1] }, { ...POP, delay });
}

/**
 * A coin that was breathing (waiting on the chain) comes to rest. The
 * breath is a CSS animation React removes with the state, so its scale and
 * opacity would otherwise snap to full; this eases them there from about
 * where the breath leaves them.
 */
export function settle(el: Element): Stoppable {
  return animate(
    el,
    { scale: [0.9, 1], opacity: [0.7, 1] },
    { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
  );
}

/** "No": a short shake, left and right, settling back in place. */
export function shake(el: Element): Stoppable {
  return animate(
    el,
    { x: [0, -9, 8, -6, 4, -2, 0] },
    { duration: 0.45, ease: "easeOut" },
  );
}

/*
 * Flights: small coins that cross the block. They're off the main thread,
 * on a CSS motion path.
 */

/**
 * A small coin that flies from `from` to `to` along a quadratic curve bent
 * through `via`, fading in as it leaves and shrinking into its target.
 * Lives in `layer`, an absolutely positioned overlay, and removes itself
 * when done. A negative `delay` starts it partway through.
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
    left: "0",
    top: "0",
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    background: color,
    opacity: "0",
    pointerEvents: "none",
    offsetPath: `path("M ${from.x} ${from.y} Q ${via.x} ${via.y} ${to.x} ${to.y}")`,
    offsetRotate: "0deg",
  });
  layer.appendChild(el);
  const flight = el.animate(
    [
      { offsetDistance: "0%", opacity: 0, transform: "scale(1)" },
      { opacity: 1, offset: 0.08 },
      { transform: "scale(1)", offset: 0.6 },
      { opacity: 1, offset: 0.7 },
      { offsetDistance: "100%", opacity: 0, transform: "scale(0.3)" },
    ],
    {
      delay: delay * 1000,
      duration: duration * 1000,
      easing: "ease-out",
      fill: "both",
    },
  );
  flight.onfinish = () => el.remove();
  // Stopping early (unmount, replay) must not leave coins behind.
  return {
    stop: () => {
      flight.cancel();
      el.remove();
    },
  };
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
