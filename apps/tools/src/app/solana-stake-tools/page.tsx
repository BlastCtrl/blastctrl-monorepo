"use client";

import { cn } from "@blastctrl/ui";
import Link from "next/link";

export default function StakeAccounts() {
  const navigation = [
    {
      name: "Create a stake account",
      href: "/solana-stake-tools/stake-create",
      description: "Create a stake account with advanced options.",
      active: true,
    },
    {
      name: "Modify stake account authorities",
      href: "/solana-stake-tools/stake-authorize",
      description:
        "Modify stake/withdraw authorities on an existing stake account.",
      active: true,
    },
    {
      name: "Modify stake account lockup",
      href: "/solana-stake-tools/set-lockup",
      description:
        "Modify the lockup period and custodian for a stake account.",
      active: true,
    },
    {
      name: "Split stake",
      href: "/solana-stake-tools/split-stake",
      description: "Split a single stake account into two.",
      active: true,
    },
    {
      name: "Merge stake accounts",
      href: "/solana-stake-tools/merge-stake",
      description: "Merge two compatible stake accounts into one.",
      active: true,
    },
  ];
  return (
    <>
      <h1 className="pb-4">Tools to create and manage your stake accounts.</h1>
      <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-4">
        {navigation.map((navItem) => (
          <Link
            key={navItem.name}
            href={navItem.active ? navItem.href : "#"}
            className={cn(
              "block cursor-pointer rounded-md border border-gray-300 bg-white p-4 transition-all duration-75",
              "hover:bg-indigo-100 hover:ring-2 hover:ring-indigo-600 focus:outline-none",
              !navItem.active && "pointer-events-none",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="block text-base font-medium text-gray-900">
                {navItem.name}
              </h2>
              {!navItem.active && (
                <span className="inline-flex rotate-2 items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  Under construction
                </span>
              )}
            </div>
            <h3
              className={cn(
                "mt-1 flex items-center text-sm text-gray-500",
                !navItem.active && "blur-[2px]",
              )}
            >
              {navItem.description}
            </h3>
          </Link>
        ))}
      </div>
    </>
  );
}
