"use client";

import { cn } from "@blastctrl/ui";
import { Tab } from "@headlessui/react";
import { AddTo } from "./_components/add-to";
import { RemoveFrom } from "./_components/remove-from";

export default function Collections() {
  return (
    <Tab.Group
      defaultIndex={0}
      as="div"
      className="mx-auto w-full max-w-xl flex-col overflow-visible rounded-md"
    >
      <Tab.List className="grid w-full grid-cols-2 items-stretch overflow-hidden bg-indigo-100/20 pb-2.5 text-gray-500 sm:pb-0">
        {({ selectedIndex }) => (
          <>
            {["Add", "Remove"].map((tab, i) => (
              <Tab
                key={tab}
                className={cn(
                  "rounded-tl-md border-b-2 py-1.5 pt-2 hover:bg-indigo-200/50",
                  selectedIndex === i
                    ? "border-indigo-700 font-medium text-gray-900"
                    : "border-transparent font-normal text-gray-500",
                )}
              >
                {tab}
              </Tab>
            ))}
          </>
        )}
      </Tab.List>
      <Tab.Panels>
        <Tab.Panel>
          <AddTo />
        </Tab.Panel>
        <Tab.Panel>
          <RemoveFrom />
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  );
}
