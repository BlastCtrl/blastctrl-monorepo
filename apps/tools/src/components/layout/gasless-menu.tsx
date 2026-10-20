"use client";

import BonkSmall from "@/../public/bonk_small.png";
import { cn } from "@blastctrl/ui";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ArrowsRightLeftIcon } from "@heroicons/react/20/solid";
import type { Variants } from "motion/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { BAR_LINK } from "./bar-link";

export const GASLESS = [
  {
    name: "BONK Gasless Swap",
    href: "/gasless-bonk-swap",
    description: "Swap BONK for SOL without gas",
    Icon: BonkAvatar,
  },
  {
    name: "Gasless Swap",
    href: "/gasless-swap",
    description: "Everything else, swapped for SOL",
    Icon: SwapBadge,
  },
];

function BonkAvatar({ className }: { className?: string }) {
  return (
    <Image
      src={BonkSmall}
      alt=""
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}

function SwapBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700",
        className,
      )}
    >
      <ArrowsRightLeftIcon aria-hidden="true" className="size-[60%]" />
    </span>
  );
}

/** A Next link that Motion can animate. */
const MotionLink = motion.create(Link);

/** Each bubble follows the one before it in, and they leave last-first. */
const STAGGER: Variants = {
  hidden: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
  shown: { transition: { staggerChildren: 0.09 } },
};

const BUBBLE: Variants = {
  hidden: (i: number) => ({
    opacity: 0,
    scale: 0.4,
    y: -16,
    rotate: i % 2 ? 8 : -8,
    transition: { duration: 0.12 },
  }),
  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    rotate: 0,
    transition: { type: "spring", stiffness: 260, damping: 15 },
  },
};

/** The bubbles only fade when the viewer asked for less motion. */
const FADE: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.15 } },
  shown: { opacity: 1, transition: { duration: 0.15 } },
};

/**
 * "Gasless Swap" in the desktop bar. Two white bubbles pop up under the
 * button, centred on it, one after the other, each tilted its own way, and
 * settle with a wobble. No panel: the row they sit in is transparent.
 */
export function GaslessMenu() {
  const reduced = useReducedMotion();
  return (
    <Menu as="div" className="relative">
      {({ open }) => (
        <>
          <MenuButton className={cn(BAR_LINK, "data-open:bg-primary-focus")}>
            Gasless Swap
          </MenuButton>
          <AnimatePresence>
            {open && (
              <MenuItems
                static
                as={motion.div}
                initial="hidden"
                animate="shown"
                exit="hidden"
                variants={STAGGER}
                className="absolute top-full left-1/2 z-20 mt-2 flex -translate-x-1/2 items-start gap-2 focus:outline-none"
              >
                {GASLESS.map(({ name, href, description, Icon }, i) => (
                  <MenuItem key={href}>
                    <MotionLink
                      href={href}
                      custom={i}
                      variants={reduced ? FADE : BUBBLE}
                      style={{ originX: 0.5, originY: 0 }}
                      // Hover and keyboard focus lift the bubble a touch and
                      // deepen its ring and shadow. Plain CSS on `translate`,
                      // so it eases without a bounce and stays clear of the
                      // transform Motion animates.
                      className="flex w-44 flex-col items-start gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-zinc-900/5 transition-[translate,box-shadow] duration-150 ease-out focus:outline-none data-focus:-translate-y-0.5 data-focus:shadow-xl data-focus:ring-zinc-900/10 motion-reduce:transition-none"
                    >
                      <Icon className="size-8" />
                      <span className="text-sm font-semibold text-slate-800">
                        {name}
                      </span>
                      <span className="text-xs text-pretty text-zinc-500">
                        {description}
                      </span>
                    </MotionLink>
                  </MenuItem>
                ))}
              </MenuItems>
            )}
          </AnimatePresence>
        </>
      )}
    </Menu>
  );
}
