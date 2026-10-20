"use client";

import { useCluster } from "@solana/connector/react";
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
  use(browser("The active cluster is client-side state"));
  const { type } = useCluster();
  return showsTestAccountsPanel(type) && <TestAccountsPanel />;
}
