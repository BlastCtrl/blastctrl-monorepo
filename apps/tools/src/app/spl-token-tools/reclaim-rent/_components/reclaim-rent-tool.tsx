"use client";

import { useCluster } from "@solana/connector/react";
import { Suspense, use } from "react";
import { browser } from "react-dom";
import { ReclaimRent } from "./reclaim-rent";
import { showsTestAccountsPanel } from "./test-accounts";
import { TestAccountsPanel } from "./test-accounts-panel";

/** Everything on the page: the tool, and on devnet the test accounts panel. */
export function ReclaimRentTool() {
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
