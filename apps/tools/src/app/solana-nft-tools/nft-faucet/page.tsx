"use client";

import { RadioGroup } from "@headlessui/react";
import { cn } from "@blastctrl/ui";
import { useState } from "react";

const options = [
  {
    name: "V1 NFT",
    description: "A simple NFT",
    standard: "Metaplex Token Metadata",
    cost: "0.01 SOL",
  },
  {
    name: "Libreplex NFT",
    description: "A simple NFT",
    standard: "Libreplex",
    cost: "0.01 SOL",
  },
  {
    name: "Core NFT",
    description: "A simple NFT",
    standard: "Metaplex Core",
    cost: "0.01 SOL",
  },
];

// interfaces: v1nft, programmable_nft, libreplex nft, libreplex inscription, metaplex inscription, cNFT, weNFT, Core NFT

// Tags: metaplex, WEN, inscription, libreplex

export default function NftFaucet() {
  const [selected, setSelected] = useState<
    (typeof options)[number] | undefined
  >(undefined);

  return (
    <div className="mx-auto w-[min(100%,var(--breakpoint-sm))] p-4 outline-red-600 outline-solid">
      <div className="pb-4">
        <h1 className="pb-1 font-display text-2xl font-bold">
          Get a random NFT
        </h1>
        <p className="text-zinc-500">
          Mint an NFT/Asset for yourself using any of the supported standards.
          Intended to be used for development testing purposes, but if you just
          want to get an NFT, be our guest 😉
        </p>
      </div>
      <RadioGroup value={selected} onChange={setSelected}>
        <RadioGroup.Label className="sr-only">Server size</RadioGroup.Label>
        <div className="space-y-4">
          {options.map((option) => (
            <RadioGroup.Option
              key={option.name}
              value={option}
              className={({ active }) =>
                cn(
                  active
                    ? "border-indigo-600 ring-2 ring-indigo-600"
                    : "border-gray-300",
                  "relative block cursor-pointer rounded-lg border bg-white px-6 py-4 shadow-xs focus:outline-hidden sm:flex sm:justify-between",
                )
              }
            >
              {({ active, checked }) => (
                <>
                  <span className="flex items-center">
                    <span className="flex flex-col text-sm">
                      <RadioGroup.Label
                        as="span"
                        className="font-medium text-gray-900"
                      >
                        {option.name}
                      </RadioGroup.Label>
                      <RadioGroup.Description
                        as="span"
                        className="text-gray-500"
                      >
                        <span className="block sm:inline">
                          {option.description}
                        </span>{" "}
                        <span
                          className="hidden sm:mx-1 sm:inline"
                          aria-hidden="true"
                        >
                          &middot;
                        </span>{" "}
                        <span className="block sm:inline">
                          {option.standard}
                        </span>
                      </RadioGroup.Description>
                    </span>
                  </span>
                  <RadioGroup.Description
                    as="span"
                    className="mt-2 flex text-sm sm:mt-0 sm:ml-4 sm:flex-col sm:text-right"
                  >
                    <span className="font-medium text-gray-900">
                      {option.cost}
                    </span>
                  </RadioGroup.Description>
                  <span
                    className={cn(
                      active ? "border" : "border-2",
                      checked ? "border-indigo-600" : "border-transparent",
                      "pointer-events-none absolute -inset-px rounded-lg",
                    )}
                    aria-hidden="true"
                  />
                </>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
