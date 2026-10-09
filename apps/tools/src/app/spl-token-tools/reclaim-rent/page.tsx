"use client";

import { useNetworkConfigurationStore } from "@/state/use-network-configuration";
import { Suspense, use } from "react";
import { browser } from "react-dom";
import { ReclaimRent } from "./_components/reclaim-rent";
import { showsTestAccountsPanel } from "./_components/test-accounts";
import { TestAccountsPanel } from "./_components/test-accounts-panel";

export default function ReclaimRentPage() {
  return (
    <>
      <ReclaimRent />
      <Suspense fallback={null}>
        <TestAccounts />
      </Suspense>
    </>
  );
}

function TestAccounts() {
  use(browser("The network is persisted in localStorage"));
  const network = useNetworkConfigurationStore((state) => state.network);
  return showsTestAccountsPanel(network) && <TestAccountsPanel />;
}
