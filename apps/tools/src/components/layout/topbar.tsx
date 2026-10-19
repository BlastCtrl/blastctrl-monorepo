"use client";

import BlastCtrlIcon from "@/../public/blastctrl_icon_white.svg";
import { navigation } from "@/app/_links";
import { ConnectorButton } from "@/connector/connector-button";
import { cn } from "@blastctrl/ui";
import {
  CloseButton,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { BAR_LINK } from "./bar-link";
import { CommandPaletteContext } from "./command-palette";
import { GASLESS, GaslessMenu } from "./gasless-menu";
import { ReclaimLink } from "./reclaim-link";

const SECTIONS = navigation.filter(
  (nav) => !nav.in && !GASLESS.some((swap) => swap.href === nav.href),
);

export function Topbar() {
  const { setIsOpen } = useContext(CommandPaletteContext);
  const [modifierKey, setModifierKey] = useState("⌘");

  useEffect(() => {
    // we need useEffect because SSR
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModifierKey(
      navigator.platform.startsWith("Mac") || navigator.platform === "iPhone"
        ? "⌘" // command key
        : "Ctrl ", // control key
    );
  }, []);

  return (
    <>
      <Disclosure as="nav" className="bg-primary" aria-label="Global">
        <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center px-2 lg:px-0">
              <div className="flex shrink-0 items-center">
                <Link href="/">
                  <Image
                    src={BlastCtrlIcon}
                    alt="BlastCtrl"
                    height={38}
                    width={38}
                    className="size-9.5"
                  />
                </Link>
              </div>
              <div className="hidden lg:ml-6 lg:flex lg:items-center">
                {SECTIONS.map((item) => (
                  <Link key={item.name} href={item.href} className={BAR_LINK}>
                    {item.name}
                  </Link>
                ))}
                <GaslessMenu />
                <ReclaimLink className="ml-2" />
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center px-2 lg:ml-6 lg:justify-end">
              <div className="w-full max-w-md lg:max-w-60">
                <label htmlFor="search" className="sr-only">
                  Search
                </label>
                <div className="relative text-white">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon
                      className="h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <button
                    id="search"
                    onClick={() => setIsOpen(true)}
                    name="search"
                    value="Search"
                    className={cn(
                      "block w-full rounded-md border-transparent bg-primary-focus py-2 pr-3 pl-10 text-left text-base leading-5 sm:text-sm",
                      "hover:cursor-text",
                    )}
                  >
                    Search
                  </button>
                  <div className="absolute inset-y-0 right-0 hidden py-1.5 pr-1.5 sm:flex lg:hidden xl:flex">
                    <kbd className="inline-flex items-center rounded-sm border border-transparent px-2 font-sans text-sm font-medium text-gray-200 shadow-xs">
                      {modifierKey}K
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <ConnectorButton mobile="icon" />
              {/* Mobile menu button: the bars, or a cross while open */}
              <DisclosureButton
                className={cn(
                  "group inline-flex items-center justify-center rounded-md p-2 text-gray-50",
                  "hover:bg-accent hover:text-gray-900 focus:ring-2 focus:ring-white focus:outline-hidden focus:ring-inset",
                )}
              >
                <span className="sr-only">Open menu</span>
                <XMarkIcon
                  className="hidden h-6 w-6 group-data-open:block"
                  aria-hidden="true"
                />
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  className="block h-6 w-6 group-data-open:hidden"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M 20.25 17.25 L 12.849 17.25"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M 20.25 7.415 L 3.75 7.415"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M 20.25 12.333 L 7.98 12.333"
                  />
                </svg>
              </DisclosureButton>
            </div>
            <div className="hidden lg:ml-4 lg:flex lg:items-center">
              <ConnectorButton />
            </div>
          </div>
        </div>

        {/* Each link is a CloseButton: a plain link that also shuts the panel. */}
        <DisclosurePanel className="lg:hidden">
          <div className="flex w-full flex-col items-start gap-y-1 px-2 pt-2 pb-3">
            {SECTIONS.map((item) => (
              <CloseButton
                key={item.name}
                as={Link}
                href={item.href}
                className={BAR_LINK}
              >
                {item.name}
              </CloseButton>
            ))}
            {GASLESS.map(({ name, href, Icon }) => (
              <CloseButton
                key={href}
                as={Link}
                href={href}
                className={cn(BAR_LINK, "inline-flex items-center gap-x-2")}
              >
                <Icon className="size-6" />
                {name}
              </CloseButton>
            ))}
            <ReclaimLink className="mt-2 ml-3" />
          </div>
        </DisclosurePanel>
      </Disclosure>
    </>
  );
}
