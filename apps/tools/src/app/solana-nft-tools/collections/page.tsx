"use client";

import { cn } from "@blastctrl/ui";
import { TabGroup, TabList, TabPanels, TabPanel, Tab } from "@headlessui/react";
import { AddTo } from "./_components/add-to";
import { RemoveFrom } from "./_components/remove-from";

export default function Collections() {
  return (
    <TabGroup
      defaultIndex={0}
      as="div"
      className="mx-auto w-full max-w-xl flex-col overflow-visible rounded-md"
    >
      <TabList className="grid w-full grid-cols-2 items-stretch overflow-hidden bg-indigo-100/20 pb-2.5 text-gray-500 sm:pb-0">
        {["Add", "Remove"].map((tab) => (
          <Tab
            key={tab}
            className={cn(
              "rounded-tl-md border-b-2 py-1.5 pt-2 hover:bg-indigo-200/50",
              "border-transparent font-normal text-gray-500",
              "data-[selected]:border-indigo-700 data-[selected]:font-medium data-[selected]:text-gray-900",
            )}
          >
            {tab}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        <TabPanel>
          <AddTo />
        </TabPanel>
        <TabPanel>
          <RemoveFrom />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  );
}
