"use client";

import { cn } from "@blastctrl/ui";
import { SpeakerWaveIcon, SpeakerXMarkIcon } from "@heroicons/react/20/solid";
import { useSound } from "./sound";

/**
 * Sound on or off for the whole tool. Small and out of the way: a speaker
 * that shows its state, with "Sound" spelled out so it isn't a riddle.
 * Every instance shares the one setting, so it can sit in two places for
 * different screen sizes.
 */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useSound();
  const Icon = on ? SpeakerWaveIcon : SpeakerXMarkIcon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      title={on ? "Turn sound off" : "Turn sound on"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
        on
          ? "text-zinc-600 hover:text-zinc-900"
          : "text-zinc-400 hover:text-zinc-700",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      Sound
    </button>
  );
}
