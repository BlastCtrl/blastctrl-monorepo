"use client";

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { AutomaticRecover } from "./_components/automatic";
import { ManualInput } from "./_components/manual-input";

const tabs = [{ name: "Automatic" }, { name: "Manual Input" }];

export default function RecoverNested() {
  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white px-4 pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <h1 className="font-display mb-4 text-3xl font-semibold">
        Recover Nested Token Accounts
      </h1>

      <TabGroup>
        <TabList className="mb-4 flex divide-x divide-gray-200 shadow">
          {tabs.map((tab) => (
            <Tab
              key={tab.name}
              className="group relative min-w-0 flex-1 overflow-hidden px-4 py-2 text-center text-sm font-medium text-gray-500 data-[hover]:bg-indigo-50 data-[selected]:bg-indigo-50 data-[selected]:text-gray-900"
            >
              {tab.name}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 group-data-[selected]:bg-indigo-500"
              />
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel>
            <AutomaticRecover />
          </TabPanel>
          <TabPanel>
            <ManualInput />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
