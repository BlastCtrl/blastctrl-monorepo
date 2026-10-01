import type { PlayOptions, SoundName } from "cuelume";
import { play, setEnabled } from "cuelume";
import { useEffect, useSyncExternalStore } from "react";

type Sound = { sound: SoundName } & Pick<PlayOptions, "volume" | "emphasis">;

/**
 * The tool's sounds, each tuned on its own: which cuelume sound, how loud
 * (`volume`, 0 to 1, on top of the global volume) and how heavy
 * (`emphasis`: "subtle", "normal" or "strong").
 */
export const SOUNDS = {
  /** Ticks as coins pop in after the scan, one per two coins. */
  arriving: { sound: "select", volume: 0.5, emphasis: "subtle" },
  /** Ticks as coins turn green while reclaiming, one per two coins. */
  turning: { sound: "select", volume: 0.6, emphasis: "subtle" },
  /** The chord once the last coin has turned. */
  reclaimed: { sound: "success", volume: 1, emphasis: "subtle" },
  /** Some transactions went through, some didn't: done, but needs a look. */
  partlyFailed: { sound: "warning", emphasis: "subtle" },
  /** Nothing went through. Muted, short, and only once. */
  failed: { sound: "error", emphasis: "subtle" },
} as const satisfies Record<string, Sound>;

const cue =
  ({ sound, ...options }: Sound) =>
  () =>
    play(sound, options);

/** One cue per moment, never one per transaction or digit. */
export const cues = {
  arriving: cue(SOUNDS.arriving),
  turning: cue(SOUNDS.turning),
  reclaimed: cue(SOUNDS.reclaimed),
  partlyFailed: cue(SOUNDS.partlyFailed),
  failed: cue(SOUNDS.failed),
};

const KEY = "blasttools:sound";
const CHANGE = "blasttools:sound-change";

/** What was set this session, for browsers where storage throws. */
let remembered: boolean | null = null;

function read() {
  if (remembered !== null) return remembered;
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

/**
 * Sound on or off, on by default and remembered in this browser. Browsers
 * keep audio silent until the first click anyway, so nothing ever plays on
 * page load. Turning it on answers with a small click, so you hear it's on.
 */
export function useSound() {
  const on = useSyncExternalStore(subscribe, read, () => true);
  useEffect(() => setEnabled(on), [on]);

  const set = (next: boolean) => {
    remembered = next;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // Private mode or blocked storage: the session still remembers.
    }
    setEnabled(next);
    window.dispatchEvent(new Event(CHANGE));
    if (next) play("toggle", { emphasis: "subtle" });
  };

  return [on, set] as const;
}
