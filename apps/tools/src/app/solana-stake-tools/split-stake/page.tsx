"use client";

import { StakeProgram } from "@solana/web3.js";
import { useRentQuery } from "./rent-query";
import { SplitManualForm } from "./split-manual-form";
import { SplitGraphicForm } from "./split-graphic-form";
import { Tab, TabList, TabGroup, TabPanel, TabPanels } from "@headlessui/react";
import { Box } from "./box";

export default function StakeLockupManagement() {
  useRentQuery(StakeProgram.space); // prefetch

  return (
    <TabGroup>
      <Box>
        <header className="border-b border-gray-200 pb-4">
          <h1 className="font-display text-3xl font-semibold">
            Split stake account
          </h1>
          <div className="mt-4 text-sm text-gray-500">
            Split a single stake account into two separate stake accounts, where
            each will hold a portion of the funds. This transaction can be
            signed by the <em>stake authority</em> of the original stake
            account. Recommended only for advanced users.
          </div>
        </header>

        <div className="w-full text-sm/6">
          <TabList className="mx-auto mt-4 flex w-64 items-stretch rounded-lg p-0.5 text-zinc-700 shadow-sm ring-1 ring-indigo-950/10">
            {["Simple", "Manual"].map((tab, i) => (
              <Tab
                key={tab}
                data-index={i}
                className="flex-1 rounded-md py-1.5 font-semibold data-[index=0]:-mr-2 data-[index=1]:-ml-2 data-[selected]:bg-indigo-500 data-[selected]:text-white data-[selected]:ring-2 data-[selected]:ring-inset data-[selected]:ring-white/50"
              >
                {tab}
              </Tab>
            ))}
          </TabList>
        </div>
      </Box>
      <TabPanels>
        <TabPanel>
          <SplitGraphicForm />
        </TabPanel>
        <TabPanel>
          <SplitManualForm />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  );
}
